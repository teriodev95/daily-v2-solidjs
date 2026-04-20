import type * as schema from '../../db/schema';
import type { NeighborSet } from './types';
import { countWords, parseTags } from './utils';

type ArticleRow = typeof schema.wikiArticles.$inferSelect;
type ProjectRow = typeof schema.projects.$inferSelect;

export interface ManifestAuth {
  kind: 'share_token' | 'pat' | 'session';
  granted_scopes: string[];
  missing_scopes: string[];
  scope_bound_to?: { type: 'project'; id: string };
  expires_at?: string;
}

export interface WikiManifest {
  article: {
    id: string;
    title: string;
    tags: string[];
    updated_at: string;
    word_count: number;
    project: { id: string; name: string };
  };
  neighbors: NeighborSet;
  links: {
    content: string;
    outline: string;
    graph: string;
    space_search: string;
    space_tags: string;
    space_index: string;
  };
  actions: Record<string, unknown>;
  auth: ManifestAuth;
}

/** Build the wiki manifest envelope. Pure function; callers pre-load rows + neighbors. */
export function buildManifest(args: {
  article: ArticleRow;
  project: ProjectRow;
  neighbors: NeighborSet;
  base: string;
  auth: ManifestAuth;
}): WikiManifest {
  const { article, project, neighbors, base, auth } = args;
  const id = article.id;
  const pid = project.id;

  return {
    article: {
      id,
      title: article.title,
      tags: parseTags(article.tags),
      updated_at: article.updated_at,
      word_count: countWords(article.content ?? ''),
      project: { id: pid, name: project.name },
    },
    neighbors,
    links: {
      content: `${base}/agent/wiki/${id}/content`,
      outline: `${base}/agent/wiki/${id}/outline`,
      graph: `${base}/agent/wiki/${id}/graph?depth=1`,
      space_search: `${base}/agent/wiki/space/${pid}/search?q=`,
      space_tags: `${base}/agent/wiki/space/${pid}/tags`,
      space_index: `${base}/agent/wiki/space/${pid}/index`,
    },
    actions: {},
    auth,
  };
}
