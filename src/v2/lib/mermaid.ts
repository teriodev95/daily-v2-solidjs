let counter = 0;
const nextId = () => {
  try {
    return `mermaid-${crypto.randomUUID()}`;
  } catch {
    counter += 1;
    return `mermaid-${Date.now()}-${counter}`;
  }
};

export interface RenderOptions {
  // If provided and returns true at any async checkpoint, abort the swap
  // to avoid injecting SVG into a focused contenteditable (turndown would
  // serialize the SVG on next input and destroy the fence).
  shouldAbort?: () => boolean;
}

const isMermaidErrorSvg = (svg: string) =>
  svg.includes('Syntax error in text') ||
  svg.includes('mermaid version') ||
  svg.includes('id="error-icon"') ||
  svg.includes("id='error-icon'");

const makeErrorElement = (src: string, message: string) => {
  const errorEl = document.createElement('div');
  errorEl.className = 'mermaid-error text-red-500/70 text-sm py-2';
  errorEl.textContent = `Error al renderizar diagrama: ${message}`;
  errorEl.setAttribute('data-src', src);
  errorEl.setAttribute('contenteditable', 'false');
  return errorEl;
};

export async function renderAll(
  root: HTMLElement,
  isDark: boolean,
  opts: RenderOptions = {}
): Promise<void> {
  if (!root) return;
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>('pre > code.language-mermaid')
  );
  const rendered = Array.from(
    root.querySelectorAll<HTMLElement>('.mermaid-rendered')
  );
  if (blocks.length === 0 && rendered.length === 0) return;

  if (opts.shouldAbort?.()) return;
  const mermaid = (await import('mermaid')).default;
  if (opts.shouldAbort?.()) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'strict',
  });

  for (const el of rendered) {
    if (el.dataset.rendered !== 'true') continue;
    if (!el.isConnected) continue;
    const src = el.getAttribute('data-src') || '';
    try {
      const id = nextId();
      const { svg } = await mermaid.render(id, src);
      if (opts.shouldAbort?.() || !el.isConnected) continue;
      if (isMermaidErrorSvg(svg)) {
        el.replaceWith(makeErrorElement(src, 'sintaxis Mermaid inválida'));
        continue;
      }
      el.classList.add('cursor-zoom-in');
      el.setAttribute('title', 'Abrir diagrama');
      el.innerHTML = svg;
    } catch (err) {
      if (opts.shouldAbort?.() || !el.isConnected) continue;
      const message = err instanceof Error ? err.message : String(err);
      el.replaceWith(makeErrorElement(src, message));
    }
  }

  for (const code of blocks) {
    const pre = code.parentElement;
    if (!pre || !pre.isConnected) continue;
    const src = code.textContent || '';
    try {
      const id = nextId();
      const { svg } = await mermaid.render(id, src);
      if (opts.shouldAbort?.() || !pre.isConnected) continue;
      if (isMermaidErrorSvg(svg)) {
        pre.replaceWith(makeErrorElement(src, 'sintaxis Mermaid inválida'));
        continue;
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-rendered cursor-zoom-in';
      wrapper.setAttribute('data-src', src);
      wrapper.setAttribute('title', 'Abrir diagrama');
      wrapper.dataset.rendered = 'true';
      wrapper.setAttribute('contenteditable', 'false');
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch (err) {
      if (opts.shouldAbort?.() || !pre.isConnected) continue;
      const message = err instanceof Error ? err.message : String(err);
      pre.replaceWith(makeErrorElement(src, message));
    }
  }
}

export function revertAll(root: HTMLElement): void {
  if (!root) return;
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>('.mermaid-rendered, .mermaid-error')
  );
  for (const node of nodes) {
    const src = node.getAttribute('data-src') || '';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-mermaid';
    code.textContent = src;
    pre.appendChild(code);
    node.replaceWith(pre);
  }
}
