/**
 * Markdown / text helpers for the wiki-share feature. Pure functions; no I/O.
 */

export interface OutlineEntry {
  level: number;
  text: string;
  anchor: string;
}

const WIKILINK_RX = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/** Extract unique [[target]] titles from markdown content. */
export function parseWikilinks(content: string): string[] {
  if (!content) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  WIKILINK_RX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RX.exec(content)) !== null) {
    const t = m[1].trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** lowercase, strip accents, replace spaces with '-', strip non-alphanumeric. */
export function makeAnchor(text: string): string {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Parse H2/H3/H4 headings into a flat outline. */
export function extractOutline(markdown: string): OutlineEntry[] {
  if (!markdown) return [];
  const out: OutlineEntry[] = [];
  const lines = markdown.split(/\r?\n/);
  // Skip headings inside fenced code blocks.
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{2,4})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    if (!text) continue;
    out.push({ level, text, anchor: makeAnchor(text) });
  }
  return out;
}

/** Remove markdown noise so snippets read cleanly. */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  let s = text;
  // Fenced code blocks & inline code
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/`[^`]*`/g, ' ');
  // Images & links — keep visible text
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Wiki links — keep display text (prefer alias if present)
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, d) => (d ?? t));
  // Headings / blockquotes / list markers
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  s = s.replace(/^\s*>\s?/gm, '');
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  s = s.replace(/^\s*\d+\.\s+/gm, '');
  // Emphasis markers
  s = s.replace(/[*_~]{1,3}/g, '');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Trim a string to maxLen chars with ellipsis, stripping markdown first. */
export function truncateSnippet(text: string, maxLen: number = 150): string {
  const clean = stripMarkdown(text ?? '');
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).trimEnd() + '...';
}

/** Cheap word count for manifest meta. */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** JSON.parse with safe array fallback (for the tags column). */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Build a 150-char snippet centered on the first case-insensitive occurrence
 * of `query` in `content`. Falls back to the leading 150 chars of cleaned
 * content when no match is found.
 */
export function matchSnippet(content: string, query: string, maxLen: number = 150): string {
  const clean = stripMarkdown(content ?? '');
  if (!clean) return '';
  if (!query) return clean.length <= maxLen ? clean : clean.slice(0, maxLen) + '...';
  const idx = clean.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return clean.length <= maxLen ? clean : clean.slice(0, maxLen) + '...';
  const half = Math.floor((maxLen - query.length) / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(clean.length, start + maxLen);
  const lead = start > 0 ? '...' : '';
  const tail = end < clean.length ? '...' : '';
  return lead + clean.slice(start, end) + tail;
}
