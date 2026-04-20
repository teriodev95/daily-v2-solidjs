import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { projects, users } from '../../db/schema';

/**
 * Wiki share tokens grant read-only access to ALL articles within a single
 * project (graph-scoped). The token is minted from an "entry" article (the
 * one the user was viewing when they clicked share) for a better UX, but the
 * bearer can freely navigate the wiki graph for that project.
 *
 * Invariant: at most ONE active (non-revoked) token per (project, user) —
 * enforced by a partial unique index in migration 0014.
 */
export const wikiShareTokens = sqliteTable('wiki_share_tokens', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id),
  // Article used to mint the token — kept for UX (so "your share URL" can
  // deep-link back to the article the user shared from). Not a security
  // boundary: the token itself is project-scoped, not article-scoped.
  entry_article_id: text('entry_article_id').notNull(),
  token_hash: text('token_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  expires_at: text('expires_at').notNull(),
  created_at: text('created_at').notNull(),
  revoked_at: text('revoked_at'),
});
