import { Hono } from 'hono';
import { and, eq, like, or } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';

/**
 * Búsqueda global: una sola consulta que cruza todos los módulos.
 *
 * Antes solo existía `/api/stories/search`, así que el buscador de la app —que
 * se presenta como global— nunca encontraba una wiki, una persona ni un
 * secreto.
 *
 * PERMISOS: este endpoint atraviesa módulos, así que no puede apoyarse en el
 * `enforceScope` por prefijo de ruta. Cada bloque comprueba lo suyo:
 *  - Sesión de navegador: acceso completo a su equipo.
 *  - PAT: solo los módulos cuyo scope tenga (read o write).
 *  - Secretos: además exige rol admin, y NUNCA devuelve el valor cifrado.
 *  - Alma: solo los documentos del propio usuario.
 */
const search = new Hono<{ Bindings: Env; Variables: Variables }>();

const PER_TYPE_LIMIT = 6;

export type SearchHitType =
  | 'story' | 'wiki' | 'person' | 'project'
  | 'secret' | 'learning' | 'assignment' | 'alma';

interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle?: string;
  extra?: string;
}

const parseTags = (json: string): string[] => {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
};

search.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const q = (c.req.query('q') ?? '').trim();

  if (q.length < 2) return c.json({ results: [], counts: {} });

  const pattern = `%${q}%`;
  const teamId = user.teamId;

  // Un PAT solo ve los módulos que su token autoriza; una sesión los ve todos.
  const tokenId = c.get('tokenId');
  const scopes = c.get('scopes') ?? {};
  const canRead = (moduleName: string) => {
    if (!tokenId) return true;
    const granted = scopes[moduleName];
    return granted === 'read' || granted === 'write';
  };
  const isAdmin = user.role === 'admin';

  // El API_KEY global tiene prohibido llegar a /api/secrets/* (resuelve a un
  // admin y sería una llave maestra). Sin esta comprobación, la búsqueda sería
  // una puerta trasera a los nombres y claves de los secretos.
  const authHeader = c.req.header('Authorization') ?? '';
  const isGlobalApiKey = authHeader.startsWith('Bearer ')
    && !authHeader.slice('Bearer '.length).startsWith('dk_');

  const results: SearchHit[] = [];
  const push = (hits: SearchHit[]) => { for (const h of hits) results.push(h); };

  // ── Historias de usuario
  if (canRead('stories')) {
    const rows = await db.select().from(schema.stories).where(and(
      eq(schema.stories.team_id, teamId),
      eq(schema.stories.is_active, true),
      or(like(schema.stories.title, pattern), like(schema.stories.description, pattern), like(schema.stories.code, pattern)),
    )).limit(PER_TYPE_LIMIT);
    push(rows.map((r) => ({ type: 'story' as const, id: r.id, title: r.title, subtitle: r.code ?? undefined, extra: r.status })));
  }

  // ── Wiki
  if (canRead('wiki')) {
    const rows = await db.select().from(schema.wikiArticles).where(and(
      eq(schema.wikiArticles.team_id, teamId),
      eq(schema.wikiArticles.is_archived, false),
      or(like(schema.wikiArticles.title, pattern), like(schema.wikiArticles.content, pattern), like(schema.wikiArticles.tags, pattern)),
    )).limit(PER_TYPE_LIMIT);
    push(rows.map((r) => ({ type: 'wiki' as const, id: r.id, title: r.title, subtitle: parseTags(r.tags).slice(0, 3).join(' · ') || undefined })));
  }

  // ── Personas del equipo
  if (canRead('team')) {
    const rows = await db.select().from(schema.users).where(and(
      eq(schema.users.team_id, teamId),
      eq(schema.users.is_active, true),
      or(like(schema.users.name, pattern), like(schema.users.email, pattern)),
    )).limit(PER_TYPE_LIMIT);
    push(rows.map((r) => ({ type: 'person' as const, id: r.id, title: r.name, subtitle: r.email, extra: r.role })));
  }

  // ── Proyectos
  if (canRead('projects')) {
    const rows = await db.select().from(schema.projects).where(and(
      eq(schema.projects.team_id, teamId),
      or(like(schema.projects.name, pattern), like(schema.projects.prefix, pattern), like(schema.projects.notes, pattern)),
    )).limit(PER_TYPE_LIMIT);
    push(rows.map((r) => ({ type: 'project' as const, id: r.id, title: r.name, subtitle: r.prefix, extra: r.status })));
  }

  // ── Secretos: solo admin, y solo metadatos. El valor cifrado jamás sale.
  if (isAdmin && !isGlobalApiKey && canRead('secrets')) {
    const rows = await db.select({
      id: schema.secrets.id,
      name: schema.secrets.name,
      key: schema.secrets.key,
      tags: schema.secrets.tags,
      revoked_at: schema.secrets.revoked_at,
    }).from(schema.secrets).where(and(
      eq(schema.secrets.team_id, teamId),
      or(like(schema.secrets.name, pattern), like(schema.secrets.key, pattern), like(schema.secrets.tags, pattern)),
    )).limit(PER_TYPE_LIMIT * 2);
    push(rows.filter((r) => !r.revoked_at).slice(0, PER_TYPE_LIMIT).map((r) => ({
      type: 'secret' as const, id: r.id, title: r.name, subtitle: r.key,
      extra: parseTags(r.tags).slice(0, 3).join(' · ') || undefined,
    })));
  }

  // ── Aprendizajes
  if (canRead('learnings')) {
    const rows = await db.select().from(schema.learnings).where(and(
      eq(schema.learnings.team_id, teamId),
      or(like(schema.learnings.title, pattern), like(schema.learnings.content, pattern)),
    )).limit(PER_TYPE_LIMIT);
    push(rows.map((r) => ({ type: 'learning' as const, id: r.id, title: r.title, extra: r.status })));
  }

  // ── Encomiendas
  if (canRead('tasks')) {
    const rows = await db.select().from(schema.assignments).where(and(
      eq(schema.assignments.team_id, teamId),
      or(like(schema.assignments.title, pattern), like(schema.assignments.description, pattern)),
    )).limit(PER_TYPE_LIMIT);
    push(rows.map((r) => ({ type: 'assignment' as const, id: r.id, title: r.title, extra: r.status })));
  }

  // ── Alma: memoria propia, nunca la de otro usuario.
  if (canRead('alma')) {
    const rows = await db.select().from(schema.almaDocuments).where(and(
      eq(schema.almaDocuments.user_id, user.userId),
      or(like(schema.almaDocuments.title, pattern), like(schema.almaDocuments.content, pattern), like(schema.almaDocuments.tags, pattern)),
    )).limit(PER_TYPE_LIMIT);
    push(rows.map((r) => ({ type: 'alma' as const, id: r.id, title: r.title, subtitle: r.kind })));
  }

  const counts: Record<string, number> = {};
  for (const hit of results) counts[hit.type] = (counts[hit.type] ?? 0) + 1;

  c.header('Cache-Control', 'private, no-store');
  return c.json({ results, counts });
});

export default search;
