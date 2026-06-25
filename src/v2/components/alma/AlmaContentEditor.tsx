import { createSignal, onCleanup, For, Show, type Component } from 'solid-js';
import { Search, BookOpen, Loader2 } from 'lucide-solid';
import { ContentEditor } from '../ContentEditor';
import { processWikiLinks } from '../../lib/wikiLinks';
import { api } from '../../lib/api';
import type { WikiArticle } from '../../types';

interface Props {
  content: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
  onOpenWiki: (title: string) => void;
}

interface PickerState {
  query: string;
  // Caret coordinates (viewport) to position the floating panel.
  x: number;
  y: number;
  // The text node + offset where the `@` lives, so we can splice it out.
  node: Text;
  atOffset: number;
}

/**
 * Editor for Alma documents. Wraps the shared ContentEditor (markdown + tables
 * + [[wiki link]] rendering) and adds an `@`-triggered wiki picker: typing `@`
 * opens a search panel; choosing an article splices a `[[Title]]` link in at
 * the caret. We reuse the wiki-link convention so links render and navigate via
 * the same `data-wiki-link` path the editor already understands.
 */
const AlmaContentEditor: Component<Props> = (props) => {
  let editorEl: HTMLElement | undefined;
  const [picker, setPicker] = createSignal<PickerState | null>(null);
  const [results, setResults] = createSignal<WikiArticle[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [activeIdx, setActiveIdx] = createSignal(0);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    clearTimeout(searchTimer);
    // Remove the editor listeners we attached on mount so they don't accumulate
    // (and double-fire) across navigations away from and back to the Alma tab.
    if (editorEl) {
      editorEl.removeEventListener('keyup', syncPicker);
      editorEl.removeEventListener('click', syncPicker);
      editorEl.removeEventListener('keydown', onKeyDown);
    }
  });

  const closePicker = () => {
    setPicker(null);
    setResults([]);
    setActiveIdx(0);
  };

  const runSearch = (query: string) => {
    clearTimeout(searchTimer);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    searchTimer = setTimeout(async () => {
      try {
        const res = await api.wiki.search(query);
        // Only apply if the picker is still open on the same query.
        if (picker()?.query === query) { setResults(res.slice(0, 8)); setActiveIdx(0); }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);
  };

  // Read the current caret and decide whether an `@token` is being typed.
  const syncPicker = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) { closePicker(); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { closePicker(); return; }
    const textNode = node as Text;
    const text = textNode.textContent ?? '';
    const caret = range.startOffset;
    // Find the nearest `@` to the left of the caret that has no whitespace after it.
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) { closePicker(); return; }
    const token = before.slice(at + 1);
    // Abort if the token contains whitespace/newline or the `@` is mid-word.
    if (/\s/.test(token)) { closePicker(); return; }
    const prevChar = at > 0 ? before[at - 1] : ' ';
    if (prevChar && !/\s/.test(prevChar)) { closePicker(); return; }

    const rect = range.getBoundingClientRect();
    setPicker({ query: token, x: rect.left, y: rect.bottom, node: textNode, atOffset: at });
    runSearch(token);
  };

  const insertLink = (title: string) => {
    const p = picker();
    if (!p) return;
    const text = p.node.textContent ?? '';
    const caretEnd = p.atOffset + 1 + p.query.length;
    // Replace `@query` with the wiki-link markup `[[Title]]`.
    const replacement = `[[${title}]]`;
    p.node.textContent = text.slice(0, p.atOffset) + replacement + text.slice(caretEnd);
    // Place the caret right after the inserted link.
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      const pos = p.atOffset + replacement.length;
      range.setStart(p.node, Math.min(pos, p.node.textContent!.length));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    closePicker();
    // Notify the shared editor so it converts HTML→markdown and re-renders the link.
    editorEl?.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!picker()) return;
    const list = results();
    if (e.key === 'Escape') { e.preventDefault(); closePicker(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, list.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
    if ((e.key === 'Enter' || e.key === 'Tab') && list.length > 0) {
      e.preventDefault();
      insertLink(list[activeIdx()].title);
    }
  };

  return (
    <div class="relative">
      <ContentEditor
        content={props.content}
        placeholder={props.placeholder}
        onChange={props.onChange}
        processHtml={processWikiLinks}
        onLinkClick={(target) => props.onOpenWiki(target)}
        onEditorMount={(el) => {
          editorEl = el;
          el.addEventListener('keyup', syncPicker);
          el.addEventListener('click', syncPicker);
          el.addEventListener('keydown', onKeyDown);
        }}
        onEditorBlur={() => { setTimeout(closePicker, 200); }}
      />

      <Show when={picker()}>
        {(p) => (
          <div
            class="fixed z-[120] w-72 max-w-[80vw] bg-base-100 border border-base-content/[0.1] rounded-xl shadow-xl overflow-hidden"
            style={{ left: `${Math.min(p().x, window.innerWidth - 296)}px`, top: `${p().y + 6}px` }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div class="flex items-center gap-2 px-3 py-2 border-b border-base-content/[0.06] text-base-content/40">
              <Search size={13} />
              <span class="text-[11px] font-medium truncate">
                {p().query ? `Wiki: ${p().query}` : 'Escribe para buscar en la wiki'}
              </span>
              <Show when={loading()}><Loader2 size={12} class="animate-spin ml-auto" /></Show>
            </div>
            <Show
              when={results().length > 0}
              fallback={
                <div class="px-3 py-3 text-[11px] text-base-content/40">
                  <Show when={p().query.trim() && !loading()} fallback="Empieza a escribir el nombre de un artículo.">
                    Sin coincidencias.
                  </Show>
                </div>
              }
            >
              <div class="max-h-56 overflow-y-auto py-1">
                <For each={results()}>
                  {(article, i) => (
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(i())}
                      onClick={() => insertLink(article.title)}
                      class={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                        activeIdx() === i() ? 'bg-ios-blue-500/10 text-ios-blue-500' : 'hover:bg-base-content/5 text-base-content/80'
                      }`}
                    >
                      <BookOpen size={12} class="shrink-0 opacity-60" />
                      <span class="text-[12px] font-medium truncate flex-1">{article.title}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
};

export default AlmaContentEditor;
