/// <reference types="@cloudflare/workers-types" />
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './db/schema';

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
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
};
