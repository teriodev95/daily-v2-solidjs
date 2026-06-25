/**
 * Alma content link processing.
 *
 * Reuses the wiki-link transport (`[[ ]]` + `data-wiki-link`) so links round-trip
 * through the shared ContentEditor turndown rule untouched. On top of that it
 * renders two visually distinct, self-explanatory chips so the reader has
 * certainty about what each reference is and what clicking does:
 *
 *   [[Article]]      → wiki chip   (book icon, violet)  → opens the article
 *   [[secret:KEY]]   → secret chip (lock icon, amber)   → reference only; the
 *                      value is never shown here.
 *
 * `data-wiki-link` carries the raw target ("secret:KEY" or "Article"); the
 * editor's click handler branches on the `secret:` prefix.
 */

const SECRET_PREFIX = 'secret:';

const BASE_STYLE =
  'display:inline-flex;align-items:center;gap:3px;padding:0 6px;border-radius:6px;' +
  'font-size:0.9em;font-weight:600;text-decoration:none;line-height:1.45;white-space:nowrap;cursor:pointer;';
const WIKI_STYLE = BASE_STYLE + 'background:rgba(139,92,246,0.12);color:#8b5cf6;';
const SECRET_STYLE = BASE_STYLE + 'background:rgba(245,158,11,0.16);color:#d97706;';

const BOOK_SVG =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
const LOCK_SVG =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

const escapeAttr = (s: string): string => s.replace(/"/g, '&quot;');
const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function processAlmaContent(html: string): string {
  // Skip code/pre blocks so references inside fenced code stay literal.
  const parts = html.split(/(<(?:code|pre)[^>]*>[\s\S]*?<\/(?:code|pre)>)/gi);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(/\[\[(.+?)(?:\|(.+?))?\]\]/g, (_match, target: string, display?: string) => {
        const safeTarget = escapeAttr(target);
        if (target.startsWith(SECRET_PREFIX)) {
          const key = target.slice(SECRET_PREFIX.length);
          const label = escapeText(display || key);
          return (
            `<a class="alma-ref alma-ref-secret" data-wiki-link="${safeTarget}" href="#" ` +
            `title="Referencia a un secreto del vault — el valor no se revela aquí" style="${SECRET_STYLE}">${LOCK_SVG}${label}</a>`
          );
        }
        const label = escapeText(display || target);
        return (
          `<a class="alma-ref alma-ref-wiki" data-wiki-link="${safeTarget}" href="#" ` +
          `title="Abrir artículo de wiki" style="${WIKI_STYLE}">${BOOK_SVG}${label}</a>`
        );
      });
    })
    .join('');
}
