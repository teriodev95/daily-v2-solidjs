import { Hono } from 'hono';
import { eq, and, gte, lte } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';
import { publish, teamChannel } from '../lib/realtime';

const completions = new Hono<{ Bindings: Env; Variables: Variables }>();

const userCanAccessStory = async (
  db: Variables['db'],
  user: Variables['user'],
  storyId: string,
) => {
  const [story] = await db
    .select()
    .from(schema.stories)
    .where(eq(schema.stories.id, storyId))
    .limit(1);

  if (!story || story.team_id !== user.teamId) return null;
  if (story.assignee_id === user.userId || story.created_by === user.userId) return story;

  const [link] = await db
    .select()
    .from(schema.storyAssignees)
    .where(
      and(
        eq(schema.storyAssignees.story_id, storyId),
        eq(schema.storyAssignees.user_id, user.userId),
      ),
    )
    .limit(1);

  return link ? story : null;
};

// List completions for the authenticated user in a date range
completions.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!from || !to) return c.json({ error: 'from and to query params required' }, 400);

  const rows = await db
    .select()
    .from(schema.storyCompletions)
    .where(
      and(
        eq(schema.storyCompletions.user_id, user.userId),
        gte(schema.storyCompletions.completion_date, from),
        lte(schema.storyCompletions.completion_date, to),
      ),
    );

  return c.json(rows);
});

// Mark a story as completed for a specific date
completions.post('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json<{ story_id: string; completion_date: string }>();

  if (!body.story_id || !body.completion_date) {
    return c.json({ error: 'story_id and completion_date required' }, 400);
  }

  const story = await userCanAccessStory(db, user, body.story_id);
  if (!story || !story.is_active) return c.json({ error: 'Story not found' }, 404);
  if (!story.frequency || (story.status !== 'todo' && story.status !== 'in_progress')) {
    return c.json({ error: 'Only active recurring stories can be completed by occurrence' }, 400);
  }

  // Check if already exists
  const existing = await db
    .select()
    .from(schema.storyCompletions)
    .where(
      and(
        eq(schema.storyCompletions.story_id, body.story_id),
        eq(schema.storyCompletions.user_id, user.userId),
        eq(schema.storyCompletions.completion_date, body.completion_date),
      ),
    )
    .limit(1);

  if (existing.length > 0) return c.json(existing[0]);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.storyCompletions).values({
    id,
    story_id: body.story_id,
    user_id: user.userId,
    completion_date: body.completion_date,
    created_at: now,
  });

  const [created] = await db
    .select()
    .from(schema.storyCompletions)
    .where(eq(schema.storyCompletions.id, id))
    .limit(1);

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'completion.created',
      story_id: body.story_id,
      completion_date: body.completion_date,
    }, c.req.header('x-client-id')),
  );

  return c.json(created, 201);
});

// Unmark a story completion for a specific date
completions.delete('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json<{ story_id: string; completion_date: string }>();

  if (!body.story_id || !body.completion_date) {
    return c.json({ error: 'story_id and completion_date required' }, 400);
  }

  const story = await userCanAccessStory(db, user, body.story_id);
  if (!story) return c.json({ error: 'Story not found' }, 404);

  await db
    .delete(schema.storyCompletions)
    .where(
      and(
        eq(schema.storyCompletions.story_id, body.story_id),
        eq(schema.storyCompletions.user_id, user.userId),
        eq(schema.storyCompletions.completion_date, body.completion_date),
      ),
    );

  c.executionCtx.waitUntil(
    publish(c.env, teamChannel(user.teamId), {
      type: 'completion.deleted',
      story_id: body.story_id,
      completion_date: body.completion_date,
    }, c.req.header('x-client-id')),
  );

  return c.json({ ok: true });
});

export default completions;
