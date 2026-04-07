/**
 * Process wiki links in HTML content.
 * Supports [[Article Name]] and [[Article Name|Display Text]].
 */
export function processWikiLinks(html: string): string {
  return html.replace(
    /\[\[(.+?)(?:\|(.+?))?\]\]/g,
    (_match, target, display) => {
      const label = display || target;
      return `<a class="wiki-link" data-wiki-link="${target}" href="#" style="color: var(--purple-500, #a855f7); text-decoration: underline; text-decoration-style: dotted; cursor: pointer;">${label}</a>`;
    }
  );
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
