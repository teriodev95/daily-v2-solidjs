/// <reference types="@cloudflare/workers-types" />
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './db/schema';

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  BUCKET: R2Bucket;
  API_KEY: string;
  DEEPSEEK_API_KEY: string;
  AI: Ai;
  TOKEN_ENCRYPTION_KEY: string;
  // Centrifugo realtime publisher. Secrets; see wiki "Centrifugo production realtime".
  CENTRIFUGO_API_URL?: string;
  CENTRIFUGO_API_KEY?: string;
  // Cloudflare rate-limit binding (unsafe.bindings in wrangler.toml). Optional
  // because the binding may be unavailable in local dev without the
  // --experimental-rate-limit flag; consumers must fail open on absence.
  AGENT_RL: any;
}

export type AppDb = DrizzleD1Database<typeof schema>;

export interface AuthUser {
  userId: string;
  teamId: string;
  role: 'admin' | 'collaborator';
}

export type Variables = {
  db: AppDb;
  user: AuthUser;
  scopes?: Record<string, 'none' | 'read' | 'write'>;
  tokenId?: string;
  // Which kind of token authenticated the request, if any. Absent on session
  // / legacy API_KEY auth. 'pat' = Bearer dk_*; 'share' = ?s=st_* share URL.
  tokenKind?: 'pat' | 'share';
  // Share-token row id, set only when tokenKind === 'share'. Used as the
  // rate-limit key so we can throttle per share link independently of PATs.
  shareTokenId?: string;
  // Scope of the share token. 'story' binds to a single story id; 'project'
  // binds to a whole wiki project (graph-scoped wiki share). Absent when the
  // caller isn't using a share token.
  shareTokenScope?: { type: 'story' | 'project'; id: string };
};
