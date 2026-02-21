import { createSignal, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import type { Story } from '../types';
import { useData } from '../lib/data';
import { api } from '../lib/api';
import { Search, ArrowRight, X } from 'lucide-solid';

const statusDot: Record<string, string> = {
  backlog: 'bg-base-content/20',
  todo: 'bg-ios-blue-500',
  in_progress: 'bg-amber-500',
  done: 'bg-ios-green-500',
};

interface Props {
  onClose: () => void;
  onSelect: (story: Story) => void;
}

const SearchModal: Component<Props> = (props) => {
  const data = useData();
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<Story[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [activeIdx, setActiveIdx] = createSignal(0);

  let inputRef!: HTMLInputElement;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  onMount(() => inputRef.focus());
  onCleanup(() => clearTimeout(debounce));

  const doSearch = (q: string) => {
    clearTimeout(debounce);
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce = setTimeout(async () => {
      try {
        const res = await api.stories.search(q.trim());
        setResults(res as Story[]);
        setActiveIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const select = (story: Story) => {
    props.onSelect(story);
    props.onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const list = results();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && list.length > 0) {
      e.preventDefault();
      select(list[activeIdx()]);
    } else if (e.key === 'Escape') {
      props.onClose();
    }
  };

  const highlight = (text: string, q: string) => {
    if (!q || q.length < 2) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark class="bg-ios-blue-500/20 text-inherit rounded-sm px-px">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const matchField = (story: Story, q: string): string | null => {
    const lower = q.toLowerCase();
    if (story.title.toLowerCase().includes(lower)) return null; // already shown
    if (story.description?.toLowerCase().includes(lower)) return story.description;
    if (story.purpose?.toLowerCase().includes(lower)) return story.purpose;
    if (story.objective?.toLowerCase().includes(lower)) return story.objective;
    return null;
  };

  return (
    <div
      class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-end sm:items-start sm:justify-center sm:pt-[15vh] animate-in fade-in duration-200"
      onClick={() => props.onClose()}
    >
      <div
        class="w-full sm:max-w-xl bg-base-100 rounded-t-[24px] sm:rounded-[24px] shadow-2xl shadow-black/50 border border-base-content/[0.06] overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div class="flex items-center gap-3 px-6 h-16 sm:h-[60px] border-b border-base-content/[0.06] bg-base-100/50 backdrop-blur-md relative group">
          <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-md bg-transparent transition-colors group-focus-within:bg-ios-blue-500/40" />
          <Search size={18} strokeWidth={2.5} class="text-base-content/30 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query()}
            onInput={(e) => {
              const val = e.currentTarget.value;
              setQuery(val);
              doSearch(val);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar por título, código o contenido..."
            class="flex-1 bg-transparent outline-none text-[16px] sm:text-[15px] font-bold tracking-tight placeholder:text-base-content/20 text-base-content/90 focus:text-base-content transition-colors"
          />
          <Show when={query()}>
            <button
              onClick={() => { setQuery(''); setResults([]); inputRef.focus(); }}
              class="p-2 rounded-xl text-base-content/30 hover:text-base-content/60 hover:bg-base-content/[0.04] transition-all"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </Show>
          <kbd class="hidden sm:flex items-center text-[10px] font-bold text-base-content/30 bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-2 py-1 uppercase tracking-widest">esc</kbd>
        </div>

        {/* Results */}
        <div class="max-h-[60vh] sm:max-h-[50vh] overflow-y-auto">
          <Show when={query().trim().length >= 2}>
            <Show when={!loading() && results().length === 0}>
              <div class="px-6 py-12 text-center">
                <p class="text-[13px] font-bold text-base-content/40 tracking-wide">
                  Sin resultados para "{query()}"
                </p>
              </div>
            </Show>

            <Show when={results().length > 0}>
              <div class="py-2 px-2">
                <For each={results()}>
                  {(story, i) => {
                    const proj = story.project_id ? data.getProjectById(story.project_id) : null;
                    const match = () => matchField(story, query());

                    return (
                      <button
                        onClick={() => select(story)}
                        onMouseEnter={() => setActiveIdx(i())}
                        class={`w-full flex items-start gap-4 px-4 py-3 sm:py-3 rounded-xl text-left transition-all duration-200 group ${activeIdx() === i()
                          ? 'bg-base-content/[0.04]'
                          : 'hover:bg-base-content/[0.04] bg-transparent'
                          }`}
                      >
                        <div class={`w-2 h-2 rounded-full mt-2.5 shrink-0 ${statusDot[story.status] ?? 'bg-base-content/20'}`} />
                        <div class="flex-1 min-w-0 space-y-1">
                          <div class="flex items-center gap-2.5">
                            <Show when={story.code}>
                              <span class="text-[10px] font-mono font-bold text-base-content/30 bg-base-content/[0.04] px-1.5 py-0.5 rounded">{story.code}</span>
                            </Show>
                            <span class="text-[14px] sm:text-sm font-bold truncate group-hover:text-ios-blue-500 transition-colors tracking-wide text-base-content/90">{highlight(story.title, query())}</span>
                          </div>
                          <Show when={match()}>
                            <p class="text-[12px] font-medium text-base-content/40 truncate leading-relaxed">
                              {highlight(match()!, query())}
                            </p>
                          </Show>
                        </div>
                        <Show when={proj}>
                          <span
                            class="text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 mt-0.5 shadow-sm"
                            style={{ "background-color": `${proj!.color}15`, color: proj!.color }}
                          >
                            {proj!.prefix}
                          </span>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Show>

          {/* Empty state — before typing */}
          <Show when={query().trim().length < 2}>
            <div class="px-6 py-12 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:pb-12 text-center space-y-4">
              <p class="text-[13px] font-bold text-base-content/30 tracking-wide">Busca por título, descripción, objetivo o código</p>
              <div class="hidden sm:flex items-center justify-center gap-3 text-[11px] font-bold text-base-content/25 uppercase tracking-widest">
                <div class="flex items-center gap-1.5">
                  <kbd class="bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-2 py-1">↑↓</kbd>
                  <span>navegar</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <kbd class="bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-2 py-1">↵</kbd>
                  <span>abrir</span>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
