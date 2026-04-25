import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { publish, teamChannel } from '../lib/realtime';

// Pure broker for ephemeral presence pings. The worker holds no state —
// it just relays `presence.beat` / `presence.leave` events on the team
// channel. Receivers age out entries with a TTL (see `src/v2/lib/presence.ts`).
const presence = new Hono<{ Bindings: Env; Variables: Variables }>();

const isValidMode = (m: unknown): m is 'viewing' | 'editing' =>
  m === 'viewing' || m === 'editing';

presence.post('/beat', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const scope = typeof body.scope === 'string' ? body.scope : '';
  const mode = isValidMode(body.mode) ? body.mode : 'viewing';
  if (!scope) return c.json({ error: 'scope_required' }, 400);

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'presence.beat',
      user_id: user.userId,
      scope,
      mode,
      ts: Date.now(),
    }, c.req.header('x-client-id')),
  );
  return c.json({ ok: true });
});

presence.post('/leave', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const scope = typeof body.scope === 'string' ? body.scope : '';
  if (!scope) return c.json({ error: 'scope_required' }, 400);

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'presence.leave',
      user_id: user.userId,
      scope,
    }, c.req.header('x-client-id')),
  );
  return c.json({ ok: true });
});

export default presence;
