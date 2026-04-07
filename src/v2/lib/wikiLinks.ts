/**
 * Process wiki links in HTML content.
 * Converts [[Article Name]] to clickable links.
 */
export function processWikiLinks(html: string): string {
  return html.replace(
    /\[\[(.+?)\]\]/g,
    '<a class="wiki-link" data-wiki-link="$1" href="#" style="color: var(--purple-500, #a855f7); text-decoration: underline; text-decoration-style: dotted; cursor: pointer;">$1</a>'
  );
}

/**
 * Extract all wiki link targets from markdown content.
 */
export function extractWikiLinks(content: string): string[] {
  const regex = /\[\[(.+?)\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)];
}
