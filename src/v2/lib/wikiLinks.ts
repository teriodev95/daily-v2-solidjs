/**
 * Process wiki links in HTML content.
 * Supports [[Article Name]] and [[Article Name|Display Text]].
 * Skips content inside <code> and <pre> blocks.
 */
export function processWikiLinks(html: string): string {
  // Split HTML by code/pre blocks to avoid processing inside them
  const parts = html.split(/(<(?:code|pre)[^>]*>[\s\S]*?<\/(?:code|pre)>)/gi);
  return parts.map((part, i) => {
    // Odd indices are code/pre blocks — leave untouched
    if (i % 2 === 1) return part;
    return part.replace(
      /\[\[(.+?)(?:\|(.+?))?\]\]/g,
      (_match, target, display) => {
        const label = display || target;
        const safeTarget = target.replace(/"/g, '&quot;');
        return `<a class="wiki-link" data-wiki-link="${safeTarget}" href="#" style="color: var(--purple-500, #a855f7); text-decoration: underline; text-decoration-style: dotted; cursor: pointer;">${label}</a>`;
      }
    );
  }).join('');
}

/**
 * Extract all wiki link targets from markdown content.
 * Returns only the target (before the pipe), not the display text.
 */
export function extractWikiLinks(content: string): string[] {
  const regex = /\[\[(.+?)(?:\|.+?)?\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)];
}
