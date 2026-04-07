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

  return c.json(rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })));
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
  const linkRegex = /\[\[(.+?)\]\]/g;

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

// Update article (with history snapshot on content changes)
wiki.patch('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();

  const [current] = await db.select().from(schema.wikiArticles).where(eq(schema.wikiArticles.id, id)).limit(1);
  if (!current) return c.json({ error: 'Not found' }, 404);

  const allowed: Record<string, unknown> = {};
  if (body.title !== undefined) allowed.title = body.title;
  if (body.content !== undefined) allowed.content = body.content;
  if (body.tags !== undefined) allowed.tags = JSON.stringify(body.tags);

  // Save history snapshot when content or title changes
  if (body.content !== undefined && body.content !== current.content) {
    const history = JSON.parse(current.history || '[]');
    history.push({
      at: new Date().toISOString(),
      by: user.userId,
      title: current.title,
      preview: (current.content || '').slice(0, 200),
    });
    // Keep last 50 snapshots
    if (history.length > 50) history.splice(0, history.length - 50);
    allowed.history = JSON.stringify(history);
  }

  if (Object.keys(allowed).length > 0) {
    await db
      .update(schema.wikiArticles)
      .set({ ...allowed, updated_at: new Date().toISOString() } as any)
      .where(eq(schema.wikiArticles.id, id));
  }

  const [updated] = await db.select().from(schema.wikiArticles).where(eq(schema.wikiArticles.id, id)).limit(1);
  return c.json({ ...updated, tags: JSON.parse(updated.tags || '[]'), history: JSON.parse(updated.history || '[]') });
});

// Delete article
wiki.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  await db.delete(schema.wikiArticles).where(eq(schema.wikiArticles.id, id));
  return c.json({ ok: true });
});

export default wiki;
