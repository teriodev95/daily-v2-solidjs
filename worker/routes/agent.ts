import { Hono } from 'hono';
import { eq, and, ne, or, inArray, desc } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';

const agent = new Hono<{ Bindings: Env; Variables: Variables }>();

// ---------- helpers ----------

type ScopeLevel = 'none' | 'read' | 'write';
type ScopeMap = Record<string, ScopeLevel>;

function absUrl(c: Context, path: string): string {
  const base = new URL(c.req.url).origin;
  return `${base}${path}`;
}

function hasScope(scopes: ScopeMap | undefined, module: string, action: 'read' | 'write'): boolean {
  const granted = scopes?.[module] ?? 'none';
  if (action === 'read') return granted === 'read' || granted === 'write';
  return granted === 'write';
}

// Turn a ScopeMap into a flat array like ["stories:read", "wiki:read"].
function flattenScopes(scopes: ScopeMap | undefined): string[] {
  if (!scopes) return [];
  const out: string[] = [];
  for (const [mod, level] of Object.entries(scopes)) {
    if (level === 'none') continue;
    out.push(`${mod}:${level}`);
  }
  return out.sort();
}

// Strip markdown to extract a plain-text summary (~200 chars).
function summarize(markdown: string, limit = 200): string {
  if (!markdown) return '';
  let s = markdown;
  // code fences
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/`[^`]*`/g, ' ');
  // images / links — keep text
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // wiki links
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, d) => (d ?? t));
  // headings / blockquotes / list markers
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  s = s.replace(/^\s*>\s?/gm, '');
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  s = s.replace(/^\s*\d+\.\s+/gm, '');
  // emphasis markers
  s = s.replace(/[*_~]{1,3}/g, '');
  // collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= limit) return s;
  return s.slice(0, limit).trimEnd() + '...';
}

// Extract acceptance criteria list from a description. Finds a heading
// whose text looks like "Criterios de aceptación" / "Acceptance criteria"
// (case-insensitive, tolerant of punctuation) and pulls list items until
// the next heading or a blank run.
function parseCriteria(markdown: string): { index: number; text: string }[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const headingRx = /^\s{0,3}#{1,6}\s+(.+?)\s*$/;
  const criteriaHeadingRx = /criterios?\s+de\s+aceptaci[oó]n|acceptance\s+criteria/i;

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headingRx);
    if (m && criteriaHeadingRx.test(m[1])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return [];

  const out: { index: number; text: string }[] = [];
  const listItemRx = /^\s*(?:\d+\.|[-*+])\s+(.+?)\s*$/;
  let idx = 1;
  let blanks = 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (headingRx.test(line)) break;
    if (!line.trim()) {
      blanks++;
      // tolerate up to 1 blank line inside the list; 2+ ends it if we have items
      if (blanks >= 2 && out.length > 0) break;
      continue;
    }
    blanks = 0;
    const lm = line.match(listItemRx);
    if (lm) {
      out.push({ index: idx++, text: lm[1].trim() });
    } else if (out.length > 0) {
      // Continuation of the last item (indented wrap).
      if (/^\s+/.test(line)) {
        out[out.length - 1].text += ' ' + line.trim();
      }
      // Non-list, non-indented line after items → end of block.
      else {
        break;
      }
    }
  }

  return out;
}

// Extract unique [[wiki link]] targets from markdown.
const WIKI_LINK_RX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
function extractWikiRefs(markdown: string): string[] {
  if (!markdown) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  WIKI_LINK_RX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_LINK_RX.exec(markdown)) !== null) {
    const target = m[1].trim();
    if (!target) continue;
    const key = target.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}

// Verify that the current auth context can see this story.
// - Share-token auth: the middleware already binds the token to a single story;
//   enforce that binding as defense in depth.
// - PAT/session: story.team_id must match the authed user's team.
async function canAccessStory(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  story: { id: string; team_id: string },
): Promise<boolean> {
  const user = c.get('user');
  if (!user) return false;
  const tokenKind = c.get('tokenKind');

  if (tokenKind === 'share') {
    const shareTokenId = c.get('shareTokenId');
    if (!shareTokenId) return false;
    const db = c.get('db');
    const [st] = await db
      .select()
      .from(schema.storyShareTokens)
      .where(eq(schema.storyShareTokens.id, shareTokenId))
      .limit(1);
    if (!st) return false;
    if (st.revoked_at) return false;
    if (st.story_id !== story.id) return false;
    return true;
  }

  return story.team_id === user.teamId;
}

// ---------- GET /story/:id — the manifest ----------

agent.get('/story/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [story] = await db
    .select()
    .from(schema.stories)
    .where(eq(schema.stories.id, id))
    .limit(1);

  if (!story) return c.json({ error: 'Not found' }, 404);
  if (!(await canAccessStory(c, story))) return c.json({ error: 'Forbidden' }, 403);

  // Resolve assignee + project in parallel.
  const [assigneeRow, projectRow] = await Promise.all([
    story.assignee_id
      ? db.select().from(schema.users).where(eq(schema.users.id, story.assignee_id)).limit(1)
      : Promise.resolve([] as any[]),
    story.project_id
      ? db.select().from(schema.projects).where(eq(schema.projects.id, story.project_id)).limit(1)
      : Promise.resolve([] as any[]),
  ]);
  const assignee = assigneeRow[0];
  const project = projectRow[0];

  const scopes = c.get('scopes') as ScopeMap | undefined;
  const tokenKind = c.get('tokenKind');

  // Actions are only listed when the token's scopes could actually invoke them.
  const actions: Record<string, any> = {};
  const missingScopes: string[] = [];

  if (hasScope(scopes, 'stories', 'write')) {
    actions.update_status = {
      method: 'PATCH',
      url: absUrl(c, `/api/stories/${story.id}`),
      example_body: { status: 'in_progress' },
    };
  } else {
    missingScopes.push('stories:write');
  }

  if (hasScope(scopes, 'attachments', 'write') || hasScope(scopes, 'stories', 'write')) {
    actions.upload_file = {
      method: 'POST',
      url: absUrl(c, `/api/attachments/story/${story.id}`),
    };
  } else {
    missingScopes.push('attachments:write');
  }

  // auth.kind
  const authKind: 'share_token' | 'pat' | 'session' =
    tokenKind === 'share' ? 'share_token' : tokenKind === 'pat' ? 'pat' : 'session';

  // auth.expires_at: only meaningful for share tokens.
  let expiresAt: string | null = null;
  if (tokenKind === 'share') {
    const shareTokenId = c.get('shareTokenId');
    if (shareTokenId) {
      const [st] = await db
        .select()
        .from(schema.storyShareTokens)
        .where(eq(schema.storyShareTokens.id, shareTokenId))
        .limit(1);
      expiresAt = st?.expires_at ?? null;
    }
  }

  const manifest = {
    story: {
      id: story.id,
      title: story.title,
      status: story.status,
      priority: story.priority,
      summary: summarize(story.description ?? ''),
      assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
      project: project ? { id: project.id, name: project.name } : null,
      due_date: story.due_date ?? null,
    },
    agent_brief: {
      role: 'Estás retomando una Historia de Usuario para implementar',
      first_steps: [
        'Lee /description para la descripción completa',
        'Revisa /criteria para criterios de aceptación',
        'Si hay attachments relevantes, consulta /attachments',
        "Antes de empezar: PATCH status a 'in_progress' (requiere stories:write)",
        "Al terminar: PATCH status a 'done'",
      ],
      conventions:
        'Conventional commits. Español en UI, inglés en código. Sin emojis en UI.',
    },
    links: {
      self: absUrl(c, `/agent/story/${story.id}`),
      description: absUrl(c, `/agent/story/${story.id}/description`),
      criteria: absUrl(c, `/agent/story/${story.id}/criteria`),
      attachments: absUrl(c, `/agent/story/${story.id}/attachments`),
      related: absUrl(c, `/agent/story/${story.id}/related`),
      wiki_refs: absUrl(c, `/agent/story/${story.id}/wiki-refs`),
      project: story.project_id
        ? absUrl(c, `/agent/project/${story.project_id}/context`)
        : null,
    },
    actions,
    auth: {
      kind: authKind,
      granted_scopes: flattenScopes(scopes),
      missing_scopes: missingScopes,
      expires_at: expiresAt,
    },
  };

  return c.json(manifest);
});

// ---------- GET /story/:id/description ----------

agent.get('/story/:id/description', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [story] = await db
    .select()
    .from(schema.stories)
    .where(eq(schema.stories.id, id))
    .limit(1);

  if (!story) return c.json({ error: 'Not found' }, 404);
  if (!(await canAccessStory(c, story))) return c.json({ error: 'Forbidden' }, 403);

  return c.json({ content: story.description ?? '' });
});

// ---------- GET /story/:id/criteria ----------

agent.get('/story/:id/criteria', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [story] = await db
    .select()
    .from(schema.stories)
    .where(eq(schema.stories.id, id))
    .limit(1);

  if (!story) return c.json({ error: 'Not found' }, 404);
  if (!(await canAccessStory(c, story))) return c.json({ error: 'Forbidden' }, 403);

  // Prefer the relational acceptance_criteria table if present; otherwise
  // fall back to parsing the markdown description.
  const rows = await db
    .select()
    .from(schema.acceptanceCriteria)
    .where(eq(schema.acceptanceCriteria.story_id, story.id));

  if (rows.length > 0) {
    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
    return c.json({
      criteria: sorted.map((r, i) => ({ index: i + 1, text: r.text })),
    });
  }

  const parsed = parseCriteria(story.description ?? '');
  return c.json({ criteria: parsed });
});

// ---------- GET /story/:id/attachments ----------

agent.get('/story/:id/attachments', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

  const [story] = await db
    .select()
    .from(schema.stories)
    .where(eq(schema.stories.id, id))
    .limit(1);

  if (!story) return c.json({ error: 'Not found' }, 404);
  if (!(await canAccessStory(c, story))) return c.json({ error: 'Forbidden' }, 403);

  const rows = await db
    .select()
    .from(schema.attachments)
    .where(and(
      eq(schema.attachments.story_id, story.id),
      eq(schema.attachments.team_id, user.teamId),
    ));

  return c.json({
    attachments: rows.map((a) => ({
      id: a.id,
      file_name: a.file_name,
      mime_type: a.mime_type,
      file_size: a.file_size,
      download_url: absUrl(c, `/api/attachments/file/${a.id}`),
      created_at: a.created_at,
    })),
  });
});

// ---------- GET /story/:id/related ----------

agent.get('/story/:id/related', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

  const [story] = await db
    .select()
    .from(schema.stories)
    .where(eq(schema.stories.id, id))
    .limit(1);

  if (!story) return c.json({ error: 'Not found' }, 404);
  if (!(await canAccessStory(c, story))) return c.json({ error: 'Forbidden' }, 403);

  if (!story.project_id) return c.json({ related: [] });

  const rows = await db
    .select()
    .from(schema.stories)
    .where(and(
      eq(schema.stories.project_id, story.project_id),
      eq(schema.stories.team_id, user.teamId),
      eq(schema.stories.is_active, true),
      ne(schema.stories.id, story.id),
      or(
        eq(schema.stories.status, 'todo'),
        eq(schema.stories.status, 'in_progress'),
        eq(schema.stories.status, 'done'),
      ),
    ))
    .orderBy(desc(schema.stories.updated_at))
    .limit(5);

  return c.json({
    related: rows.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      url: absUrl(c, `/agent/story/${s.id}`),
    })),
  });
});

// ---------- GET /story/:id/wiki-refs ----------

agent.get('/story/:id/wiki-refs', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

  const [story] = await db
    .select()
    .from(schema.stories)
    .where(eq(schema.stories.id, id))
    .limit(1);

  if (!story) return c.json({ error: 'Not found' }, 404);
  if (!(await canAccessStory(c, story))) return c.json({ error: 'Forbidden' }, 403);

  const refs = extractWikiRefs(story.description ?? '');
  if (refs.length === 0) return c.json({ wiki_refs: [] });

  // Look up all wiki articles in this team once, then match case-insensitively.
  const articles = await db
    .select()
    .from(schema.wikiArticles)
    .where(eq(schema.wikiArticles.team_id, user.teamId));

  const byTitle = new Map<string, (typeof articles)[number]>();
  for (const a of articles) {
    if (a.is_archived) continue;
    byTitle.set(a.title.toLowerCase(), a);
  }

  const wiki_refs = refs.map((reference) => {
    const article = byTitle.get(reference.toLowerCase());
    if (!article) return { reference, found: false };
    const content = article.content ?? '';
    const excerpt = content.length > 500 ? content.slice(0, 500) + '...' : content;
    return {
      reference,
      found: true,
      article: {
        id: article.id,
        title: article.title,
        content_excerpt: excerpt,
        url: absUrl(c, `/api/wiki/${article.id}`),
      },
    };
  });

  return c.json({ wiki_refs });
});

// ---------- GET /project/:id/context ----------

agent.get('/project/:id/context', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const projectId = c.req.param('id');
  const tokenKind = c.get('tokenKind');

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project) return c.json({ error: 'Not found' }, 404);
  if (project.team_id !== user.teamId) return c.json({ error: 'Forbidden' }, 403);

  // Share-token holders can only see the project their bound story belongs to.
  if (tokenKind === 'share') {
    const shareTokenId = c.get('shareTokenId');
    if (!shareTokenId) return c.json({ error: 'Forbidden' }, 403);
    const [st] = await db
      .select()
      .from(schema.storyShareTokens)
      .where(eq(schema.storyShareTokens.id, shareTokenId))
      .limit(1);
    if (!st || st.revoked_at) return c.json({ error: 'Forbidden' }, 403);
    const [boundStory] = await db
      .select()
      .from(schema.stories)
      .where(eq(schema.stories.id, st.story_id))
      .limit(1);
    if (!boundStory || boundStory.project_id !== project.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  // Pull all project stories in one query, partition in memory.
  const projectStories = await db
    .select()
    .from(schema.stories)
    .where(and(
      eq(schema.stories.project_id, project.id),
      eq(schema.stories.team_id, user.teamId),
      eq(schema.stories.is_active, true),
    ));

  const completed = projectStories
    .filter((s) => s.status === 'done')
    .sort((a, b) => {
      const ak = a.completed_at ?? a.updated_at;
      const bk = b.completed_at ?? b.updated_at;
      return (bk ?? '').localeCompare(ak ?? '');
    })
    .slice(0, 5);

  const activeCount = projectStories.filter(
    (s) => s.status === 'todo' || s.status === 'in_progress',
  ).length;

  return c.json({
    project: {
      id: project.id,
      name: project.name,
      prefix: project.prefix,
    },
    recent_completed: completed.map((s) => ({
      id: s.id,
      title: s.title,
      completed_at: s.completed_at ?? s.updated_at,
      url: absUrl(c, `/agent/story/${s.id}`),
    })),
    active_count: activeCount,
    conventions: 'Conventional commits. Español en UI, inglés en código. Sin emojis.',
  });
});

export default agent;
