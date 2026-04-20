import { and, eq } from 'drizzle-orm';
import type { AppDb } from '../../types';
import * as schema from '../../db/schema';
import type { ArticleSummary, GraphEdge, GraphNode, NeighborSet } from './types';
import { parseTags, parseWikilinks, truncateSnippet } from './utils';

type ArticleRow = typeof schema.wikiArticles.$inferSelect;

/**
 * Load every non-archived article in a project. Graph + neighbor + backlink
 * queries all need the full set, so we fetch once and pass it around.
 */
export async function loadProjectArticles(
  db: AppDb,
  projectId: string,
  teamId: string,
): Promise<ArticleRow[]> {
  const rows = await db
    .select()
    .from(schema.wikiArticles)
    .where(
      and(
        eq(schema.wikiArticles.project_id, projectId),
        eq(schema.wikiArticles.team_id, teamId),
      ),
    );
  return rows.filter((r) => !r.is_archived);
}

function buildArticleUrl(base: string, id: string): string {
  return `${base}/agent/wiki/${id}`;
}

export function toArticleSummary(article: ArticleRow, base: string): ArticleSummary {
  return {
    id: article.id,
    title: article.title,
    url: buildArticleUrl(base, article.id),
    snippet: truncateSnippet(article.content, 150),
    tags: parseTags(article.tags),
  };
}

export function toGraphNode(article: ArticleRow, base: string): GraphNode {
  return {
    id: article.id,
    title: article.title,
    url: buildArticleUrl(base, article.id),
    snippet: truncateSnippet(article.content, 150),
    tags: parseTags(article.tags),
  };
}

/**
 * Compute the three neighbor buckets for an article. All articles are
 * assumed pre-loaded to keep this synchronous and cheap.
 */
export function buildNeighborSet(
  article: ArticleRow,
  siblings: ArticleRow[],
  base: string,
): NeighborSet {
  const byTitle = new Map<string, ArticleRow>();
  for (const s of siblings) byTitle.set(s.title.toLowerCase(), s);

  const articleTags = new Set(parseTags(article.tags));

  // Outbound — [[wikilinks]] in this article.
  const outbound: ArticleSummary[] = [];
  for (const target of parseWikilinks(article.content ?? '')) {
    if (outbound.length >= 10) break;
    const hit = byTitle.get(target.toLowerCase());
    if (!hit || hit.id === article.id) continue;
    outbound.push(toArticleSummary(hit, base));
  }

  // Inbound — other articles whose content contains [[this title]].
  const needle = article.title.toLowerCase();
  const inbound: ArticleSummary[] = [];
  for (const sib of siblings) {
    if (inbound.length >= 10) break;
    if (sib.id === article.id) continue;
    const refs = parseWikilinks(sib.content ?? '');
    if (refs.some((r) => r.toLowerCase() === needle)) {
      inbound.push(toArticleSummary(sib, base));
    }
  }

  // by_tag — siblings sharing any tag, excluding self + already-linked.
  const linkedIds = new Set<string>();
  outbound.forEach((o) => linkedIds.add(o.id));
  inbound.forEach((o) => linkedIds.add(o.id));
  const by_tag: ArticleSummary[] = [];
  if (articleTags.size > 0) {
    for (const sib of siblings) {
      if (by_tag.length >= 5) break;
      if (sib.id === article.id) continue;
      if (linkedIds.has(sib.id)) continue;
      const sibTags = parseTags(sib.tags);
      if (sibTags.some((t) => articleTags.has(t))) {
        by_tag.push(toArticleSummary(sib, base));
      }
    }
  }

  return { outbound, inbound, by_tag };
}

export interface ExpandOptions {
  depth: number;
  maxNodes: number;
  base: string;
}

/**
 * BFS neighborhood expansion. Edges are deduped on (from, to, type). Shared-tag
 * edges are only emitted from the seed (hop 0) to bound fan-out.
 */
export function expandGraph(
  seedId: string,
  siblings: ArticleRow[],
  opts: ExpandOptions,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const depth = Math.max(0, Math.min(3, opts.depth));
  const maxNodes = Math.max(1, Math.min(100, opts.maxNodes));

  const byId = new Map(siblings.map((a) => [a.id, a]));
  const byTitle = new Map(siblings.map((a) => [a.title.toLowerCase(), a]));

  const visited = new Set<string>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();

  let frontier: string[] = [seedId];

  const pushEdge = (e: GraphEdge) => {
    const k = `${e.from}|${e.to}|${e.type}`;
    if (edgeKeys.has(k)) return;
    edgeKeys.add(k);
    edges.push(e);
  };

  outer: for (let hop = 0; hop <= depth; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      const article = byId.get(id);
      if (!article) continue;

      nodes.push(toGraphNode(article, opts.base));
      if (nodes.length >= maxNodes) break outer;

      // Outbound [[wikilinks]]
      for (const target of parseWikilinks(article.content ?? '')) {
        const hit = byTitle.get(target.toLowerCase());
        if (!hit || hit.id === article.id) continue;
        pushEdge({ from: article.id, to: hit.id, type: 'wikilink' });
        if (!visited.has(hit.id)) next.push(hit.id);
      }

      // Inbound — linkers
      const needle = article.title.toLowerCase();
      for (const sib of siblings) {
        if (sib.id === article.id) continue;
        const refs = parseWikilinks(sib.content ?? '');
        if (refs.some((r) => r.toLowerCase() === needle)) {
          pushEdge({ from: sib.id, to: article.id, type: 'backlink' });
          if (!visited.has(sib.id)) next.push(sib.id);
        }
      }

      // Shared-tag edges only at hop 0 — caps combinatorial blow-up.
      if (hop === 0) {
        const myTags = parseTags(article.tags);
        if (myTags.length > 0) {
          const myTagSet = new Set(myTags);
          for (const sib of siblings) {
            if (sib.id === article.id) continue;
            const shared = parseTags(sib.tags).find((t) => myTagSet.has(t));
            if (!shared) continue;
            pushEdge({ from: article.id, to: sib.id, type: 'shared_tag', tag: shared });
            if (!visited.has(sib.id) && depth > 0) next.push(sib.id);
          }
        }
      }
    }
    frontier = next;
    if (nodes.length >= maxNodes) break;
    if (frontier.length === 0) break;
  }

  return { nodes, edges };
}
