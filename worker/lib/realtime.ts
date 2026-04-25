import type { Env } from '../types';

// Fire-and-forget publish to Centrifugo HTTP API. Always resolves — errors
// are logged and swallowed so realtime issues never break the originating
// mutation. Callers should invoke via `c.executionCtx.waitUntil(publish(...))`.
//
// Convention: a single channel per team, `team.<team_id>`, carrying typed
// payloads `{ type: 'story.updated', ... }`. See wiki "Centrifugo production
// realtime" for endpoint and credentials.
let loggedMissingSecrets = false;

// Publishes a tagged event. `actorClientId` lets the originating TAB suppress
// its own echo. Using tab-scoped id (not user-scoped) means two tabs of the
// same user correctly sync with each other.
export async function publish(
  env: Env,
  channel: string,
  data: Record<string, unknown> & { type: string },
  actorClientId?: string,
): Promise<void> {
  if (!env.CENTRIFUGO_API_URL || !env.CENTRIFUGO_API_KEY) {
    if (!loggedMissingSecrets) {
      console.warn('[realtime] publish disabled: CENTRIFUGO_API_URL or CENTRIFUGO_API_KEY not set');
      loggedMissingSecrets = true;
    }
    return;
  }
  const payload = actorClientId ? { ...data, actor_client_id: actorClientId } : data;
  try {
    const res = await fetch(env.CENTRIFUGO_API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': env.CENTRIFUGO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'publish',
        params: { channel, data: payload },
      }),
    });
    if (!res.ok) {
      console.error('[realtime] publish non-OK', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('[realtime] publish failed', err);
  }
}

export function teamChannel(teamId: string): string {
  return `team.${teamId}`;
}
