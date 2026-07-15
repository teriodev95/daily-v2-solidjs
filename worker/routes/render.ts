import { Hono } from 'hono';
import { marked } from 'marked';
import type { Env, Variables } from '../types';

const render = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_MARKDOWN_BYTES = 256 * 1024;
const RENDERER_VERSION = 'marked-18+cloudflare-htmlrewriter-1';

const allowedTags = new Set([
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'del', 's',
  'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'input',
]);

const removeWithContent = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'svg', 'math', 'form', 'button', 'select', 'option', 'textarea',
  'audio', 'video', 'source', 'link', 'meta', 'base', 'template',
]);

function sanitizeElement(element: Element): void {
  const tag = element.tagName.toLowerCase();

  if (!allowedTags.has(tag)) {
    if (removeWithContent.has(tag)) element.remove();
    else element.removeAndKeepContent();
    return;
  }

  const attributes = [...element.attributes];
  for (const [name] of attributes) {
    element.removeAttribute(name);
  }

  if (tag === 'a') {
    const href = attributes.find(([name]) => name.toLowerCase() === 'href')?.[1] ?? '';
    try {
      const url = new URL(href);
      if (url.protocol === 'https:') {
        element.setAttribute('href', url.href);
        element.setAttribute('rel', 'noopener noreferrer');
      }
    } catch {
      // Invalid and relative links remain plain text in the isolated iOS view.
    }
    const title = attributes.find(([name]) => name.toLowerCase() === 'title')?.[1];
    if (title) element.setAttribute('title', title.slice(0, 256));
    return;
  }

  if (tag === 'code') {
    const className = attributes.find(([name]) => name.toLowerCase() === 'class')?.[1] ?? '';
    if (/^language-[a-z0-9_+-]{1,40}$/i.test(className)) {
      element.setAttribute('class', className);
    }
    return;
  }

  if (tag === 'ol') {
    const start = attributes.find(([name]) => name.toLowerCase() === 'start')?.[1] ?? '';
    if (/^-?\d{1,6}$/.test(start)) element.setAttribute('start', start);
    return;
  }

  if (tag === 'th' || tag === 'td') {
    const align = attributes.find(([name]) => name.toLowerCase() === 'align')?.[1]?.toLowerCase();
    if (align === 'left' || align === 'center' || align === 'right') {
      element.setAttribute('align', align);
    }
    return;
  }

  if (tag === 'input') {
    const type = attributes.find(([name]) => name.toLowerCase() === 'type')?.[1]?.toLowerCase();
    if (type !== 'checkbox') {
      element.remove();
      return;
    }
    element.setAttribute('type', 'checkbox');
    element.setAttribute('disabled', '');
    if (attributes.some(([name]) => name.toLowerCase() === 'checked')) {
      element.setAttribute('checked', '');
    }
  }
}

async function sanitizeFragment(html: string): Promise<string> {
  const wrapped = `<daily-markdown-root>${html}</daily-markdown-root>`;
  const response = new HTMLRewriter()
    .on('*', { element: sanitizeElement })
    .transform(new Response(wrapped, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  return response.text();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

render.post('/markdown', async (c) => {
  let body: { markdown?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (typeof body.markdown !== 'string') {
    return c.json({ error: 'markdown_must_be_a_string', field: 'markdown' }, 400);
  }

  const sourceBytes = new TextEncoder().encode(body.markdown).byteLength;
  if (sourceBytes > MAX_MARKDOWN_BYTES) {
    return c.json({ error: 'markdown_too_large', max_bytes: MAX_MARKDOWN_BYTES }, 413);
  }

  const raw = marked.parse(body.markdown, {
    async: false,
    gfm: true,
    breaks: false,
  }) as string;
  const htmlFragment = await sanitizeFragment(raw);
  const sourceHash = await sha256Hex(body.markdown);

  c.header('Cache-Control', 'private, no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  return c.json({
    html_fragment: htmlFragment,
    renderer_version: RENDERER_VERSION,
    source_hash: sourceHash,
    source_bytes: sourceBytes,
  });
});

export default render;
