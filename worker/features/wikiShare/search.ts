import type { AppDb } from '../../types';
import * as schema from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { matchSnippet, parseTags } from './utils';

type ArticleRow = typeof schema.wikiArticles.$inferSelect;

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  tags: string[];
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Simple case-insensitive substring search over title + content + tags within
 * a single project. We pull the project's articles and filter in-memory to
 * match the snippet/tag parsing semantics the rest of the feature uses.
 */
export async function searchProject(
  db: AppDb,
  opts: { projectId: string; teamId: string; q: string; limit: number; offset: number; base: string },
): Promise<SearchResponse> {
  const { projectId, teamId, q, limit, offset, base } = opts;
  const trimmed = q.trim();

  const rows = await db
    .select()
    .from(schema.wikiArticles)
    .where(
      and(
        eq(schema.wikiArticles.project_id, projectId),
        eq(schema.wikiArticles.team_id, teamId),
      ),
    );

  const active = rows.filter((r) => !r.is_archived);

  if (!trimmed) {
    return { query: '', results: [], total: 0, limit, offset };
  }

  const needle = trimmed.toLowerCase();
  const matches = active.filter((r) => {
    if (r.title.toLowerCase().includes(needle)) return true;
    if ((r.content ?? '').toLowerCase().includes(needle)) return true;
    const tags = parseTags(r.tags);
    if (tags.some((t) => t.toLowerCase().includes(needle))) return true;
    return false;
  });

  // Title matches rank before content-only matches.
  matches.sort((a, b) => {
    const aTitle = a.title.toLowerCase().includes(needle) ? 0 : 1;
    const bTitle = b.title.toLowerCase().includes(needle) ? 0 : 1;
    if (aTitle !== bTitle) return aTitle - bTitle;
    return b.updated_at.localeCompare(a.updated_at);
  });

  const page = matches.slice(offset, offset + limit);
  const results: SearchResult[] = page.map((r) => ({
    id: r.id,
    title: r.title,
    url: `${base}/agent/wiki/${r.id}`,
    snippet: matchSnippet(r.content ?? '', trimmed, 150),
    tags: parseTags(r.tags),
  }));

  return { query: trimmed, results, total: matches.length, limit, offset };
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagsResponse {
  tags: TagCount[];
  total_articles: number;
}

/** Aggregate tag counts across a project. Excludes pseudo-tags starting with '_'. */
export async function listProjectTags(
  db: AppDb,
  opts: { projectId: string; teamId: string },
): Promise<TagsResponse> {
  const rows = await db
    .select()
    .from(schema.wikiArticles)
    .where(
      and(
        eq(schema.wikiArticles.project_id, opts.projectId),
        eq(schema.wikiArticles.team_id, opts.teamId),
      ),
    );

  const active = rows.filter((r) => !r.is_archived);
  const counts = new Map<string, number>();

  for (const r of active) {
    for (const tag of parseTags(r.tags)) {
      if (!tag || tag.startsWith('_')) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const tags = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return { tags, total_articles: active.length };
}

export interface IndexEntry {
  id: string;
  title: string;
  url: string;
}

export interface IndexResponse {
  articles: IndexEntry[];
  total: number;
}

/** Flat id+title index for discovery. No content, no snippets. */
export async function listProjectIndex(
  db: AppDb,
  opts: { projectId: string; teamId: string; base: string },
): Promise<IndexResponse> {
  const rows = await db
    .select({
      id: schema.wikiArticles.id,
      title: schema.wikiArticles.title,
      is_archived: schema.wikiArticles.is_archived,
    })
    .from(schema.wikiArticles)
    .where(
      and(
        eq(schema.wikiArticles.project_id, opts.projectId),
        eq(schema.wikiArticles.team_id, opts.teamId),
      ),
    );

  const active = rows.filter((r) => !r.is_archived);
  active.sort((a, b) => a.title.localeCompare(b.title));

  return {
    articles: active.map((r) => ({
      id: r.id,
      title: r.title,
      url: `${opts.base}/agent/wiki/${r.id}`,
    })),
    total: active.length,
  };
}
