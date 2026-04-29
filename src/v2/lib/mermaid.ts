import { chunkLoadErrorMessage, isChunkLoadError, recoverFromChunkLoadError } from './chunkRecovery';

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

const isMermaidErrorSvg = (svg: string) => {
  const lower = svg.toLowerCase();
  if (
    lower.includes('syntax error in text') ||
    lower.includes('mermaid version') ||
    lower.includes('id="error-icon"') ||
    lower.includes("id='error-icon'") ||
    lower.includes('class="error-icon"') ||
    lower.includes("class='error-icon'")
  ) {
    return true;
  }

  if (typeof document === 'undefined') return false;
  const probe = document.createElement('div');
  probe.innerHTML = svg;
  return (probe.textContent ?? '').toLowerCase().includes('syntax error in text') ||
    !!probe.querySelector('#error-icon, .error-icon, [id*="error"], [class*="error"]');
};

const compactMessage = (message: string) =>
  message
    .replace(/\s+/g, ' ')
    .replace(/^Error:\s*/i, '')
    .trim()
    .slice(0, 220);

const getErrorMessage = (err: unknown) => {
  if (isChunkLoadError(err)) return chunkLoadErrorMessage;
  return err instanceof Error ? err.message : String(err);
};

const removeLeakedMermaidErrors = () => {
  if (typeof document === 'undefined') return;
  document
    .querySelectorAll<HTMLElement>('body > div[id^="dmermaid-"], body > iframe[id^="imermaid-"]')
    .forEach((node) => node.remove());
};

const makeErrorElement = (src: string, message: string) => {
  const errorEl = document.createElement('div');
  errorEl.className = 'mermaid-error my-3 rounded-xl border border-red-500/15 bg-red-500/[0.055] px-3 py-2 text-[12px] leading-relaxed text-red-500/78';

  const title = document.createElement('div');
  title.className = 'font-semibold text-red-500/85';
  title.textContent = 'No se pudo renderizar el diagrama Mermaid';

  const detail = document.createElement('div');
  detail.className = 'mt-0.5 text-red-500/62';
  detail.textContent = compactMessage(message) || 'Revisa la sintaxis del bloque Mermaid.';

  errorEl.append(title, detail);
  errorEl.setAttribute('data-src', src);
  errorEl.setAttribute('contenteditable', 'false');
  return errorEl;
};

const renderSvg = async (mermaid: any, src: string) => {
  if (!src.trim()) throw new Error('Diagrama Mermaid vacío');
  const parsed = await mermaid.parse(src, { suppressErrors: false });
  if (parsed === false) throw new Error('Sintaxis Mermaid inválida');

  const id = nextId();
  const renderHost = document.createElement('div');
  renderHost.style.position = 'fixed';
  renderHost.style.left = '-10000px';
  renderHost.style.top = '0';
  renderHost.style.width = '1px';
  renderHost.style.height = '1px';
  renderHost.style.overflow = 'hidden';
  renderHost.style.pointerEvents = 'none';
  document.body.appendChild(renderHost);

  let svg = '';
  try {
    const result = await mermaid.render(id, src, renderHost);
    svg = result.svg;
  } finally {
    renderHost.remove();
    removeLeakedMermaidErrors();
  }

  if (isMermaidErrorSvg(svg)) throw new Error('Sintaxis Mermaid inválida');
  return svg;
};

export async function renderAll(
  root: HTMLElement,
  isDark: boolean,
  opts: RenderOptions = {}
): Promise<void> {
  if (!root) return;
  removeLeakedMermaidErrors();
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
    suppressErrorRendering: true,
  });
  removeLeakedMermaidErrors();

  for (const el of rendered) {
    if (el.dataset.rendered !== 'true') continue;
    if (!el.isConnected) continue;
    const src = el.getAttribute('data-src') || '';
    try {
      const svg = await renderSvg(mermaid, src);
      if (opts.shouldAbort?.() || !el.isConnected) continue;
      el.classList.add('cursor-zoom-in');
      el.setAttribute('title', 'Abrir diagrama');
      el.innerHTML = svg;
    } catch (err) {
      if (opts.shouldAbort?.() || !el.isConnected) continue;
      if (recoverFromChunkLoadError(err)) continue;
      const message = getErrorMessage(err);
      el.replaceWith(makeErrorElement(src, message));
    }
  }

  for (const code of blocks) {
    const pre = code.parentElement;
    if (!pre || !pre.isConnected) continue;
    const src = code.textContent || '';
    try {
      const svg = await renderSvg(mermaid, src);
      if (opts.shouldAbort?.() || !pre.isConnected) continue;
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
      if (recoverFromChunkLoadError(err)) continue;
      const message = getErrorMessage(err);
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
