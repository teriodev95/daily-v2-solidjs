import { createSignal, onCleanup, onMount } from 'solid-js';
import { marked } from 'marked';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
  strongDelimiter: '**',
});

interface ContentEditorProps {
  content: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
  processHtml?: (html: string) => string;
  onLinkClick?: (target: string) => void;
  class?: string;
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
          rounded-xl transition-all duration-150
          focus:bg-base-content/[0.02] focus:ring-1 focus:ring-base-content/[0.08]
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
        onClick={(e) => {
          const link = (e.target as HTMLElement).closest('[data-wiki-link]');
          if (link && props.onLinkClick) {
            e.preventDefault();
            props.onLinkClick((link as HTMLElement).dataset.wikiLink!);
          }
        }}
      />
    </div>
  );
}
