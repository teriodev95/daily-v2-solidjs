import { createSignal, createEffect, onCleanup, onMount, Show, For, type Component } from 'solid-js';
import { Search, BookOpen, Lock, Loader2 } from 'lucide-solid';
import { ContentEditor } from '../ContentEditor';
import { processAlmaContent } from '../../lib/almaLinks';
import { api } from '../../lib/api';

interface Props {
  content: string;
  placeholder?: string;
  fontSize?: number;
  onChange: (markdown: string) => void;
  onOpenWiki: (title: string) => void;
  onOpenSecret?: (key: string) => void;
}

type Mode = 'wiki' | 'secret';

interface PickerItem {
  id: string;
  label: string;
  sub?: string;
  insert: string;
}

interface PickerState {
  query: string;
  mode: Mode;
  // Caret coordinates (viewport) to position the floating panel.
  x: number;
  y: number;
  // The text node + offset where the trigger lives, so we can splice it out.
  node: Text;
  atOffset: number;
}

const TRIGGERS: Record<string, Mode> = { '@': 'wiki', '$': 'secret' };

/**
 * Editor for Alma documents. Wraps the shared ContentEditor (markdown + tables)
 * and adds two mention pickers that reuse the `[[ ]]` wiki-link transport so
 * everything round-trips through the editor untouched:
 *   `@` → wiki articles   → inserts `[[Title]]`
 *   `$` → secrets (vault) → inserts `[[secret:KEY]]` (a reference, never a value)
 * Links render as distinct chips via processAlmaContent; clicking branches on
 * the `secret:` prefix.
 */
const AlmaContentEditor: Component<Props> = (props) => {
  let editorEl: HTMLElement | undefined;
  const [picker, setPicker] = createSignal<PickerState | null>(null);
  const [results, setResults] = createSignal<PickerItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [activeIdx, setActiveIdx] = createSignal(0);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  // Keep the editor font-size in sync with the page-level control.
  createEffect(() => {
    const fs = props.fontSize;
    if (editorEl && fs) editorEl.style.fontSize = `${fs}px`;
  });

  onCleanup(() => {
    clearTimeout(searchTimer);
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

  const runSearch = (query: string, mode: Mode) => {
    clearTimeout(searchTimer);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    searchTimer = setTimeout(async () => {
      try {
        let items: PickerItem[];
        if (mode === 'secret') {
          // Secrets are admin-gated; a 403 for non-admins is caught below.
          const secrets = await api.secrets.list({ q: query });
          items = secrets.slice(0, 8).map((s) => ({
            id: s.id,
            label: s.name,
            sub: s.key,
            insert: `[[secret:${s.key}]]`,
          }));
        } else {
          const articles = await api.wiki.search(query);
          items = articles.slice(0, 8).map((a) => ({
            id: a.id,
            label: a.title,
            insert: `[[${a.title}]]`,
          }));
        }
        // Only apply if the picker is still open on the same query.
        const p = picker();
        if (p && p.query === query && p.mode === mode) { setResults(items); setActiveIdx(0); }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);
  };

  // Read the current caret and decide whether a `@token` / `$token` is being typed.
  const syncPicker = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) { closePicker(); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { closePicker(); return; }
    const textNode = node as Text;
    const text = textNode.textContent ?? '';
    const caret = range.startOffset;
    const before = text.slice(0, caret);

    // Pick the nearest trigger char to the left of the caret.
    let at = -1;
    let mode: Mode = 'wiki';
    for (const ch of Object.keys(TRIGGERS)) {
      const idx = before.lastIndexOf(ch);
      if (idx > at) { at = idx; mode = TRIGGERS[ch]; }
    }
    if (at === -1) { closePicker(); return; }

    const token = before.slice(at + 1);
    // Abort if the token contains whitespace/newline or the trigger is mid-word.
    if (/\s/.test(token)) { closePicker(); return; }
    const prevChar = at > 0 ? before[at - 1] : ' ';
    if (prevChar && !/\s/.test(prevChar)) { closePicker(); return; }

    const rect = range.getBoundingClientRect();
    setPicker({ query: token, mode, x: rect.left, y: rect.bottom, node: textNode, atOffset: at });
    runSearch(token, mode);
  };

  const insertItem = (item: PickerItem) => {
    const p = picker();
    if (!p) return;
    const text = p.node.textContent ?? '';
    const caretEnd = p.atOffset + 1 + p.query.length;
    const replacement = item.insert;
    p.node.textContent = text.slice(0, p.atOffset) + replacement + text.slice(caretEnd);
    // Place the caret right after the inserted reference.
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
    // Notify the shared editor so it converts HTML→markdown and renders the chip.
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
      insertItem(list[activeIdx()]);
    }
  };

  const handleLinkClick = (target: string) => {
    if (target.startsWith('secret:')) props.onOpenSecret?.(target.slice('secret:'.length));
    else props.onOpenWiki(target);
  };

  return (
    <div class="relative">
      <ContentEditor
        content={props.content}
        placeholder={props.placeholder}
        onChange={props.onChange}
        processHtml={processAlmaContent}
        onLinkClick={handleLinkClick}
        onEditorMount={(el) => {
          editorEl = el;
          if (props.fontSize) el.style.fontSize = `${props.fontSize}px`;
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
              <Show when={p().mode === 'secret'} fallback={<Search size={13} />}><Lock size={13} /></Show>
              <span class="text-[11px] font-medium truncate">
                {p().mode === 'secret'
                  ? (p().query ? `Secreto: ${p().query}` : 'Escribe para buscar un secreto')
                  : (p().query ? `Wiki: ${p().query}` : 'Escribe para buscar en la wiki')}
              </span>
              <Show when={loading()}><Loader2 size={12} class="animate-spin ml-auto" /></Show>
            </div>
            <Show
              when={results().length > 0}
              fallback={
                <div class="px-3 py-3 text-[11px] text-base-content/40">
                  <Show when={p().query.trim() && !loading()} fallback={p().mode === 'secret' ? 'Empieza a escribir el nombre o key del secreto.' : 'Empieza a escribir el nombre de un artículo.'}>
                    {p().mode === 'secret' ? 'Sin coincidencias (¿tienes acceso a secretos?).' : 'Sin coincidencias.'}
                  </Show>
                </div>
              }
            >
              <div class="max-h-56 overflow-y-auto py-1">
                <For each={results()}>
                  {(item, i) => (
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(i())}
                      onClick={() => insertItem(item)}
                      class={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                        activeIdx() === i() ? 'bg-ios-blue-500/10 text-ios-blue-500' : 'hover:bg-base-content/5 text-base-content/80'
                      }`}
                    >
                      <Show when={p().mode === 'secret'} fallback={<BookOpen size={12} class="shrink-0 opacity-60" />}>
                        <Lock size={12} class="shrink-0 text-amber-500" />
                      </Show>
                      <span class="min-w-0 flex-1">
                        <span class="text-[12px] font-medium truncate block">{item.label}</span>
                        <Show when={item.sub}>
                          <span class="text-[10px] font-mono text-base-content/40 truncate block">{item.sub}</span>
                        </Show>
                      </span>
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
