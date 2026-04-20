/**
 * Internal types for the wiki share feature. Kept separate from the Drizzle
 * row type so that manifest/graph/search consumers don't have to know about
 * the underlying table shape.
 */

export type ShareTokenValidation =
  | {
      ok: true;
      projectId: string;
      userId: string;
      teamId: string;
      tokenId: string;
      expiresAt: string;
    }
  | { ok: false; error: 'invalid' | 'expired' | 'revoked' | 'wrong_scope' };

/**
 * Path classes recognized by the wiki-share middleware. Used internally by
 * validateWikiShareToken to dispatch to the right scope check.
 */
export type PathClass =
  | { kind: 'article'; articleId: string; sub?: string }
  | { kind: 'space'; projectId: string; rest: string[] }
  | { kind: 'unknown' };

export interface ArticleSummary {
  id: string;
  title: string;
  /** Absolute URL to /agent/wiki/:id (callers build it with their base). */
  url: string;
  /** Truncated to ~150 chars to keep manifests token-efficient. */
  snippet?: string;
  tags?: string[];
}

export interface GraphNode extends ArticleSummary {
  tags: string[];
}

export type EdgeType = 'wikilink' | 'backlink' | 'shared_tag';

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  /** Only populated when `type === 'shared_tag'`. */
  tag?: string;
}

/**
 * Canonical neighbor bundle used by the manifest and graph endpoints.
 * Capped at ~10 items per bucket to keep agent payloads small.
 */
export interface NeighborSet {
  /** Articles this article links TO (outgoing wikilinks). */
  outbound: ArticleSummary[];
  /** Articles that link to THIS article (incoming wikilinks). */
  inbound: ArticleSummary[];
  /** Articles that share at least one tag with this article. */
  by_tag: ArticleSummary[];
}
