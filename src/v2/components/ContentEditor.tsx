import { createEffect, createSignal, on, onCleanup, onMount } from 'solid-js';
import { marked } from 'marked';
import TurndownService from 'turndown';

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

interface ContentEditorProps {
  content: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
  processHtml?: (html: string) => string;
  onLinkClick?: (target: string) => void;
  class?: string;
  onReady?: (handle: ContentEditorHandle) => void;
  onEditorMount?: (el: HTMLElement) => void;
  onEditorFocus?: () => void;
  onEditorBlur?: () => void;
}

export function ContentEditor(props: ContentEditorProps) {
  let editorRef!: HTMLDivElement;
  let lastContent = '';
  let convertTimer: ReturnType<typeof setTimeout> | undefined;

  const [hasContent, setHasContent] = createSignal(!!props.content?.trim());

  onCleanup(() => clearTimeout(convertTimer));

  const toHtml = (md: string): string => {
    if (!md.trim()) return '';
    let html = marked.parse(md) as string;
    if (props.processHtml) html = props.processHtml(html);
    return html;
  };

  onMount(() => {
    lastContent = props.content || '';
    editorRef.innerHTML = toHtml(lastContent);
    setHasContent(!!lastContent.trim());

    props.onEditorMount?.(editorRef);

    // Sync prop → DOM when `content` changes from outside (realtime refetch,
    // parent re-fetch). Rebuilds innerHTML only when the editor does NOT have
    // focus — preserves cursor/selection for the user who is typing.
    createEffect(on(() => props.content ?? '', (incoming) => {
      if (incoming === lastContent) return;
      if (document.activeElement === editorRef) return; // user is editing — skip
      lastContent = incoming;
      editorRef.innerHTML = toHtml(incoming);
      setHasContent(!!incoming.trim());
    }, { defer: true }));

    props.onReady?.({
      insertAtEnd: (markdown: string) => {
        const currentMd = lastContent;
        const newMd = currentMd.trim() ? currentMd + '\n\n' + markdown : markdown;
        lastContent = newMd;
        editorRef.innerHTML = toHtml(newMd);
        setHasContent(true);
        props.onChange(newMd);
      },
    });
  });

  const handleInput = () => {
    const text = editorRef.textContent?.trim() || '';
    setHasContent(!!text);

    if (!text) {
      editorRef.innerHTML = '';
      lastContent = '';
      props.onChange('');
      return;
    }

    // Debounce the HTML→MD conversion (50ms) to keep typing smooth on large content
    clearTimeout(convertTimer);
    convertTimer = setTimeout(() => {
      const md = turndown.turndown(editorRef.innerHTML).trim();
      lastContent = md;
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
        class="outline-none min-h-[200px] px-3 py-3 text-[15px] leading-relaxed
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
          prose-img:rounded-lg prose-img:shadow-sm"
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => props.onEditorFocus?.()}
        onBlur={() => props.onEditorBlur?.()}
        onMouseDown={(e) => {
          // Wiki links: click to navigate
          const wikiLink = (e.target as HTMLElement).closest('[data-wiki-link]');
          if (wikiLink && props.onLinkClick) {
            e.preventDefault();
            e.stopPropagation();
            props.onLinkClick((wikiLink as HTMLElement).dataset.wikiLink!);
            return;
          }
          // Real links: Cmd/Ctrl+click to open in new tab
          const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
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
