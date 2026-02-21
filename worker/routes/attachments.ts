import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import * as schema from '../db/schema';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const attachments = new Hono<{ Bindings: Env; Variables: Variables }>();

// List attachments for a story
attachments.get('/story/:storyId', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storyId = c.req.param('storyId');

  const rows = await db
    .select()
    .from(schema.attachments)
    .where(and(
      eq(schema.attachments.story_id, storyId),
      eq(schema.attachments.team_id, user.teamId),
    ));

  return c.json(rows);
});

// Upload attachment
attachments.post('/story/:storyId', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storyId = c.req.param('storyId');

  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'file field required' }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: 'File too large (max 10MB)' }, 413);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const r2Key = `${user.teamId}/${storyId}/${id}-${safeName}`;

  await c.env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  await db.insert(schema.attachments).values({
    id,
    story_id: storyId,
    team_id: user.teamId,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type || 'application/octet-stream',
    r2_key: r2Key,
    uploaded_by: user.userId,
    created_at: now,
  });

  const [created] = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.id, id))
    .limit(1);

  return c.json(created, 201);
});

// Serve file (proxy from R2)
attachments.get('/file/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const [attachment] = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.id, id))
    .limit(1);

  if (!attachment) return c.json({ error: 'Not found' }, 404);

  const object = await c.env.BUCKET.get(attachment.r2_key);
  if (!object) return c.json({ error: 'File not found in storage' }, 404);

  const isImage = attachment.mime_type.startsWith('image/');
  const disposition = isImage
    ? `inline; filename="${attachment.file_name}"`
    : `attachment; filename="${attachment.file_name}"`;

  return new Response(object.body, {
    headers: {
      'Content-Type': attachment.mime_type,
      'Content-Disposition': disposition,
      'Content-Length': String(attachment.file_size),
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

// Delete attachment
attachments.delete('/:id', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');

  const [attachment] = await db
    .select()
    .from(schema.attachments)
    .where(and(
      eq(schema.attachments.id, id),
      eq(schema.attachments.team_id, user.teamId),
    ))
    .limit(1);

  if (!attachment) return c.json({ error: 'Not found' }, 404);

  await c.env.BUCKET.delete(attachment.r2_key);
  await db.delete(schema.attachments).where(eq(schema.attachments.id, id));

  return c.json({ ok: true });
});

export default attachments;
