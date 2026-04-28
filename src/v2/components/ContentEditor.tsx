import { createEffect, createSignal, on, onCleanup, onMount } from 'solid-js';
import { marked } from 'marked';
import TurndownService from 'turndown';
import type * as Y from 'yjs';
import { applyTextDiff, getCaretOffset, setCaretOffset } from '../lib/textBinding';
import type { MediaGalleryItem } from './MediaGalleryLightbox';
import { isDark } from '../lib/theme';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
  strongDelimiter: '**',
});

// Preserve wiki links: <a data-wiki-link="X">Y</a> → [[X]] or [[X|Y]]
turndown.addRule('wiki-links', {
  filter: (node) => node.nodeName === 'A' && node.hasAttribute('data-wiki-link'),
  replacement: (_content, node) => {
    const target = (node as HTMLElement).getAttribute('data-wiki-link') || '';
    const text = (node as HTMLElement).textContent || '';
    return target === text ? `[[${target}]]` : `[[${target}|${text}]]`;
  },
});

export interface ContentEditorHandle {
  insertAtEnd: (markdown: string) => void;
}

export type ContentPreviewRequest = { type: 'image'; items: MediaGalleryItem[]; index: number };

interface ContentEditorProps {
  content: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
  processHtml?: (html: string) => string;
  onLinkClick?: (target: string) => void;
  onPreviewRequest?: (request: ContentPreviewRequest) => void;
  class?: string;
  onReady?: (handle: ContentEditorHandle) => void;
  onEditorMount?: (el: HTMLElement) => void;
  onEditorFocus?: () => void;
  onEditorBlur?: () => void;
  // Optional CRDT source. When provided, the editor binds bidirectionally
  // to the Y.Text: local edits are diffed and applied as ops (origin
  // 'local'); remote ops re-render the DOM while preserving the caret.
  // `props.content` is ignored in this mode — Yjs is the source of truth.
  ytext?: Y.Text;
}

export function ContentEditor(props: ContentEditorProps) {
  let editorRef!: HTMLDivElement;
  let lastContent = '';
  let convertTimer: ReturnType<typeof setTimeout> | undefined;

  const [hasContent, setHasContent] = createSignal(!!props.content?.trim());

  const hasSemanticContent = () => {
    if (editorRef.textContent?.trim()) return true;
    return !!editorRef.querySelector('img, pre, code, .mermaid-rendered, .mermaid-error, hr, table, blockquote');
  };

  // Convert any pending HTML→MD synchronously and emit. Used on unmount to
  // avoid losing the user's last keystrokes when they close the modal during
  // the 50 ms debounce window.
  const flushConvert = () => {
    if (!convertTimer || !editorRef) return;
    clearTimeout(convertTimer);
    convertTimer = undefined;
    const md = turndown.turndown(editorRef.innerHTML).trim();
    const prev = lastContent;
    lastContent = md;
    if (props.ytext) applyTextDiff(props.ytext, prev, md);
    props.onChange(md);
  };

  onCleanup(flushConvert);

  const toHtml = (md: string): string => {
    if (!md.trim()) return '';
    let html = marked.parse(md) as string;
    if (props.processHtml) html = props.processHtml(html);
    return html;
  };

  onMount(() => {
    const initial = props.ytext ? props.ytext.toString() : (props.content || '');
    lastContent = initial;
    editorRef.innerHTML = toHtml(initial);
    setHasContent(!!initial.trim());

    props.onEditorMount?.(editorRef);

    if (props.ytext) {
      // CRDT mode — watch remote ops and re-render. Skip our own ops to
      // avoid feedback loops (we already updated the DOM optimistically).
      const ytext = props.ytext;
      const observer = (_evt: Y.YTextEvent, tx: Y.Transaction) => {
        if (tx.origin === 'local') return;
        const incoming = ytext.toString();
        if (incoming === lastContent) return;
        lastContent = incoming;
        const focused = document.activeElement === editorRef;
        const caret = focused ? getCaretOffset(editorRef) : null;
        editorRef.innerHTML = toHtml(incoming);
        setHasContent(!!incoming.trim());
        if (caret !== null) setCaretOffset(editorRef, caret);
        props.onChange(incoming);
      };
      ytext.observe(observer);
      onCleanup(() => ytext.unobserve(observer));
    } else {
      // Plain mode — parent owns the markdown signal and pushes it back in.
      createEffect(on(() => props.content ?? '', (incoming) => {
        if (incoming === lastContent) return;
        if (document.activeElement === editorRef) return; // user is editing — skip
        lastContent = incoming;
        editorRef.innerHTML = toHtml(incoming);
        setHasContent(!!incoming.trim());
      }, { defer: true }));
    }

    props.onReady?.({
      insertAtEnd: (markdown: string) => {
        const currentMd = lastContent;
        const newMd = currentMd.trim() ? currentMd + '\n\n' + markdown : markdown;
        lastContent = newMd;
        editorRef.innerHTML = toHtml(newMd);
        setHasContent(true);
        if (props.ytext) {
          applyTextDiff(props.ytext, currentMd, newMd);
        }
        props.onChange(newMd);
      },
    });
  });

  const handleInput = () => {
    const hasValue = hasSemanticContent();
    setHasContent(hasValue);

    if (!hasValue) {
      const prev = lastContent;
      editorRef.innerHTML = '';
      lastContent = '';
      if (props.ytext && prev) applyTextDiff(props.ytext, prev, '');
      props.onChange('');
      return;
    }

    if (props.ytext) {
      const md = turndown.turndown(editorRef.innerHTML).trim();
      const prev = lastContent;
      lastContent = md;
      applyTextDiff(props.ytext, prev, md);
      props.onChange(md);
      return;
    }

    // Debounce plain HTML→MD conversion (50ms) to keep non-realtime editors smooth.
    clearTimeout(convertTimer);
    convertTimer = setTimeout(() => {
      const md = turndown.turndown(editorRef.innerHTML).trim();
      const prev = lastContent;
      lastContent = md;
      if (props.ytext) applyTextDiff(props.ytext, prev, md);
      props.onChange(md);
    }, 50);
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text) return;

    const success = document.execCommand('insertText', false, text);
    if (!success) {
      const sel = window.getSelection();
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        handleInput();
      }
    }
  };

  const getContentImages = (): MediaGalleryItem[] =>
    Array.from(editorRef.querySelectorAll<HTMLImageElement>('img[src]'))
      .map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt || 'Imagen del contenido',
        width: img.naturalWidth || undefined,
        height: img.naturalHeight || undefined,
        msrc: img.currentSrc || img.src,
      }))
      .filter((item) => item.src);

  const parseSvgLength = (value: string | null): number | undefined => {
    if (!value || value.includes('%')) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const getSvgDimensions = (svg: SVGSVGElement) => {
    const width = parseSvgLength(svg.getAttribute('width'));
    const height = parseSvgLength(svg.getAttribute('height'));
    if (width && height) return { width, height };

    const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (viewBox && viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
      return { width: viewBox[2], height: viewBox[3] };
    }

    const rect = svg.getBoundingClientRect();
    return {
      width: rect.width > 0 ? rect.width : 1200,
      height: rect.height > 0 ? rect.height : 720,
    };
  };

  const diagramToGalleryItem = (svg: SVGSVGElement, index: number): MediaGalleryItem => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const baseSize = getSvgDimensions(svg);
    const scale = baseSize.width < 1400 ? 1400 / baseSize.width : 1;
    const width = Math.round(baseSize.width * scale);
    const height = Math.round(baseSize.height * scale);
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${baseSize.width} ${baseSize.height}`);
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    background.setAttribute('x', '0');
    background.setAttribute('y', '0');
    background.setAttribute('width', '100%');
    background.setAttribute('height', '100%');
    background.setAttribute('fill', isDark() ? '#05070a' : '#ffffff');
    clone.insertBefore(background, clone.firstChild);

    const markup = new XMLSerializer().serializeToString(clone);
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    return {
      src,
      alt: `Diagrama Mermaid ${index + 1}`,
      width,
      height,
      msrc: src,
    };
  };

  const getContentDiagrams = (activeSvg: SVGSVGElement) => {
    const svgs = Array.from(editorRef.querySelectorAll<SVGSVGElement>('.mermaid-rendered svg'));
    const items = svgs.map(diagramToGalleryItem);
    const index = Math.max(0, svgs.indexOf(activeSvg));
    return { items, index };
  };

  return (
    <div class={`relative min-h-[200px] ${props.class ?? ''}`}>
      {!hasContent() && (
        <div class="absolute inset-0 text-base-content/25 pointer-events-none px-3 py-3 text-[15px] leading-relaxed select-none">
          {props.placeholder ?? 'Escribe aquí...'}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={true}
        class={`outline-none min-h-[200px] px-3 py-3 text-[15px] leading-relaxed
          prose prose-sm max-w-none
          prose-headings:text-base-content prose-headings:font-semibold
          prose-headings:mt-4 prose-headings:mb-2 prose-headings:first:mt-0
          prose-p:text-base-content/80 prose-p:my-1.5
          prose-strong:text-base-content prose-a:text-blue-500 prose-a:no-underline prose-a:hover:underline
          prose-code:text-base-content/90 prose-code:bg-base-content/[0.06] prose-code:text-[13px]
          prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-mono
          prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-base-content/[0.04] prose-pre:border prose-pre:border-base-content/[0.06]
          prose-pre:rounded-xl prose-pre:overflow-x-auto prose-pre:max-w-full
          prose-blockquote:border-base-content/15 prose-blockquote:text-base-content/50
          prose-blockquote:not-italic prose-blockquote:pl-4
          prose-li:text-base-content/80 prose-li:my-0.5
          prose-ul:my-2 prose-ol:my-2
          prose-hr:border-base-content/10
          prose-img:rounded-lg prose-img:shadow-sm
          ${props.onPreviewRequest ? 'prose-img:cursor-zoom-in [&_.mermaid-rendered]:cursor-zoom-in' : ''}`}
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => props.onEditorFocus?.()}
        onBlur={() => props.onEditorBlur?.()}
        onMouseDown={(e) => {
          const targetEl = e.target instanceof Element
            ? e.target
            : (e.target as Node | null)?.parentElement;
          if (!targetEl) return;

          if (props.onPreviewRequest) {
            const image = targetEl.closest('img') as HTMLImageElement | null;
            if (image?.src) {
              e.preventDefault();
              e.stopPropagation();
              const src = image.currentSrc || image.src;
              const items = getContentImages();
              const index = Math.max(0, items.findIndex((item) => item.src === src));
              props.onPreviewRequest({
                type: 'image',
                items: items.length > 0 ? items : [{
                  src,
                  alt: image.alt || 'Imagen del contenido',
                  width: image.naturalWidth || undefined,
                  height: image.naturalHeight || undefined,
                  msrc: src,
                }],
                index,
              });
              return;
            }

            const diagram = targetEl.closest('.mermaid-rendered') as HTMLElement | null;
            const svg = diagram?.querySelector('svg');
            if (diagram && svg) {
              e.preventDefault();
              e.stopPropagation();
              const { items, index } = getContentDiagrams(svg);
              props.onPreviewRequest({ type: 'image', items, index });
              return;
            }
          }

          // Wiki links: click to navigate
          const wikiLink = targetEl.closest('[data-wiki-link]');
          if (wikiLink && props.onLinkClick) {
            e.preventDefault();
            e.stopPropagation();
            props.onLinkClick((wikiLink as HTMLElement).dataset.wikiLink!);
            return;
          }
          // Real links: Cmd/Ctrl+click to open in new tab
          const anchor = targetEl.closest('a[href]') as HTMLAnchorElement | null;
          if (anchor && (e.metaKey || e.ctrlKey)) {
            const href = anchor.getAttribute('href');
            if (href && href !== '#') {
              e.preventDefault();
              e.stopPropagation();
              window.open(href, '_blank', 'noopener');
            }
          }
        }}
      />
    </div>
  );
}
