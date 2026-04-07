import { Hono } from 'hono';
import { eq, and, or, like } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';

const wiki = new Hono<{ Bindings: Env; Variables: Variables }>();

// List articles for a project (with optional tag filter)
wiki.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const projectId = c.req.query('project_id');
  const tag = c.req.query('tag');

  if (!projectId) return c.json({ error: 'project_id is required' }, 400);

  let rows = await db
    .select()
    .from(schema.wikiArticles)
    .where(and(
      eq(schema.wikiArticles.project_id, projectId),
      eq(schema.wikiArticles.team_id, user.teamId),
    ));

  if (tag) {
    rows = rows.filter(r => {
      try { return JSON.parse(r.tags).includes(tag); } catch { return false; }
    });
  }

  rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return c.json(rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })));
});

// Search articles
wiki.get('/search', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const q = (c.req.query('q') ?? '').trim();
  const projectId = c.req.query('project_id');

  if (!q || q.length < 2) return c.json([]);

  const pattern = `%${q}%`;

  let rows = await db
    .select()
    .from(schema.wikiArticles)
    .where(and(
      eq(schema.wikiArticles.team_id, user.teamId),
      or(
        like(schema.wikiArticles.title, pattern),
        like(schema.wikiArticles.content, pattern),
        like(schema.wikiArticles.tags, pattern),
      ),
    ))
    .limit(20);

  if (projectId) rows = rows.filter(r => r.project_id === projectId);

  // Add snippet around match
  const lowerQ = q.toLowerCase();
  return c.json(rows.map(r => {
    let snippet = '';
    const content = r.content || '';
    const idx = content.toLowerCase().indexOf(lowerQ);
    if (idx >= 0) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(content.length, idx + q.length + 40);
      snippet = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
    }
    return { ...r, tags: JSON.parse(r.tags || '[]'), snippet };
  }));
});

// Resolve article by title (for agents navigating [[wiki links]])
wiki.get('/resolve', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const title = (c.req.query('title') ?? '').trim();
  const projectId = c.req.query('project_id');

  if (!title) return c.json({ error: 'title is required' }, 400);
  if (!projectId) return c.json({ error: 'project_id is required' }, 400);

  const rows = await db
    .select()
    .from(schema.wikiArticles)
    .where(and(
      eq(schema.wikiArticles.project_id, projectId),
      eq(schema.wikiArticles.team_id, user.teamId),
    ));

  const found = rows.find(r => r.title.toLowerCase() === title.toLowerCase());
  if (!found) return c.json({ error: 'Not found' }, 404);

  return c.json({ ...found, tags: JSON.parse(found.tags || '[]'), history: JSON.parse(found.history || '[]') });
});

// Batch get multiple articles by IDs
wiki.post('/batch', async (c) => {
  const db = c.get('db');
  const body = await c.req.json<{ ids: string[] }>();

  if (!body.ids?.length) return c.json({ error: 'ids array required' }, 400);
  if (body.ids.length > 50) return c.json({ error: 'max 50 ids per batch' }, 400);

  const all = await db.select().from(schema.wikiArticles);
  const idSet = new Set(body.ids);
  const found = all.filter(a => idSet.has(a.id));

  return c.json(found.map(a => ({ ...a, tags: JSON.parse(a.tags || '[]') })));
});

// Get graph data for a project
wiki.get('/graph', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const projectId = c.req.query('project_id');

  if (!projectId) return c.json({ error: 'project_id is required' }, 400);

  const articles = await db
    .select()
    .from(schema.wikiArticles)
    .where(and(
      eq(schema.wikiArticles.project_id, projectId),
      eq(schema.wikiArticles.team_id, user.teamId),
    ));

  const titleMap = new Map(articles.map(a => [a.title.toLowerCase(), a.id]));
  const linkRegex = /\[\[(.+?)(?:\|.+?)?\]\]/g;

  const nodes = articles.map(a => ({
    id: a.id,
    name: a.title,
    tags: JSON.parse(a.tags || '[]'),
  }));

  const links: { source: string; target: string }[] = [];
  for (const article of articles) {
    let match;
    while ((match = linkRegex.exec(article.content)) !== null) {
      const targetId = titleMap.get(match[1].toLowerCase());
      if (targetId && targetId !== article.id) {
        links.push({ source: article.id, target: targetId });
      }
    }
  }

  return c.json({ nodes, links });
});

// Create article
wiki.post('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json<{
    project_id: string;
    title: string;
    content?: string;
    tags?: string[];
  }>();

  if (!body.title?.trim()) return c.json({ error: 'title is required', field: 'title' }, 400);
  if (!body.project_id) return c.json({ error: 'project_id is required', field: 'project_id' }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.wikiArticles).values({
    id,
    project_id: body.project_id,
    team_id: user.teamId,
    title: body.title.trim(),
    content: body.content ?? '',
    tags: JSON.stringify(body.tags ?? []),
    created_by: user.userId,
    created_at: now,
    updated_at: now,
  });

  const [created] = await db.select().from(schema.wikiArticles).where(eq(schema.wikiArticles.id, id)).limit(1);
  return c.json({ ...created, tags: JSON.parse(created.tags || '[]') }, 201);
});

// Get single article
wiki.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [article] = await db.select().from(schema.wikiArticles).where(eq(schema.wikiArticles.id, id)).limit(1);
  if (!article) return c.json({ error: 'Not found' }, 404);

  return c.json({ ...article, tags: JSON.parse(article.tags || '[]'), history: JSON.parse(article.history || '[]') });
});

// Get outgoing and incoming links for an article
wiki.get('/:id/links', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const id = c.req.param('id');

  const [article] = await db.select().from(schema.wikiArticles).where(eq(schema.wikiArticles.id, id)).limit(1);
  if (!article) return c.json({ error: 'Not found' }, 404);

  // All articles in same project
  const siblings = await db
    .select()
    .from(schema.wikiArticles)
    .where(and(
      eq(schema.wikiArticles.project_id, article.project_id),
      eq(schema.wikiArticles.team_id, user.teamId),
    ));

  const titleToArticle = new Map(siblings.map(a => [a.title.toLowerCase(), { id: a.id, title: a.title }]));
  const linkRegex = /\[\[(.+?)(?:\|.+?)?\]\]/g;

  // Outgoing: links FROM this article
  const outgoing: { id: string; title: string }[] = [];
  let match;
  while ((match = linkRegex.exec(article.content || '')) !== null) {
    const target = titleToArticle.get(match[1].toLowerCase());
    if (target && target.id !== id) outgoing.push(target);
  }

  // Incoming: links TO this article
  const incoming: { id: string; title: string }[] = [];
  for (const sib of siblings) {
    if (sib.id === id) continue;
    const sibRegex = /\[\[(.+?)(?:\|.+?)?\]\]/g;
    let m;
    while ((m = sibRegex.exec(sib.content || '')) !== null) {
      if (m[1].toLowerCase() === article.title.toLowerCase()) {
        incoming.push({ id: sib.id, title: sib.title });
        break;
      }
    }
  }

  return c.json({ outgoing, incoming });
});

// Update article (no automatic history — use POST /:id/snapshot explicitly)
wiki.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();

  const allowed: Record<string, unknown> = {};
  if (body.title !== undefined) allowed.title = body.title;
  if (body.content !== undefined) allowed.content = body.content;
  if (body.tags !== undefined) allowed.tags = JSON.stringify(body.tags);

  if (Object.keys(allowed).length > 0) {
    await db
      .update(schema.wikiArticles)
      .set({ ...allowed, updated_at: new Date().toISOString() } as any)
      .where(eq(schema.wikiArticles.id, id));
  }

  const [updated] = await db.select().from(schema.wikiArticles).where(eq(schema.wikiArticles.id, id)).limit(1);
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json({ ...updated, tags: JSON.parse(updated.tags || '[]'), history: JSON.parse(updated.history || '[]') });
});

// Save a snapshot of the current state (called once when opening for edit)
wiki.post('/:id/snapshot', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

  const [article] = await db.select().from(schema.wikiArticles).where(eq(schema.wikiArticles.id, id)).limit(1);
  if (!article) return c.json({ error: 'Not found' }, 404);
  if (!article.content?.trim()) return c.json({ ok: true, skipped: true });

  const history = JSON.parse(article.history || '[]');
  history.push({
    at: new Date().toISOString(),
    by: user.userId,
    title: article.title,
    preview: article.content.slice(0, 200),
  });
  if (history.length > 50) history.splice(0, history.length - 50);

  await db
    .update(schema.wikiArticles)
    .set({ history: JSON.stringify(history) } as any)
    .where(eq(schema.wikiArticles.id, id));

  return c.json({ ok: true });
});

// Delete article
wiki.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  await db.delete(schema.wikiArticles).where(eq(schema.wikiArticles.id, id));
  return c.json({ ok: true });
});

export default wiki;
