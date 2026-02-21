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
      class="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-start sm:justify-center sm:pt-[15vh]"
      onClick={() => props.onClose()}
    >
      <div
        class="w-full sm:max-w-lg bg-base-100 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/30 border border-base-content/[0.06] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div class="flex items-center gap-3 px-4 h-14 sm:h-12 border-b border-base-content/[0.06]">
          <Search size={16} class="text-base-content/25 shrink-0" />
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
            placeholder="Buscar historias..."
            class="flex-1 bg-transparent outline-none text-[16px] sm:text-sm placeholder:text-base-content/25"
          />
          <Show when={query()}>
            <button
              onClick={() => { setQuery(''); setResults([]); inputRef.focus(); }}
              class="p-2 rounded-lg text-base-content/25 hover:text-base-content/50 hover:bg-base-content/5 transition-colors"
            >
              <X size={14} />
            </button>
          </Show>
          <kbd class="hidden sm:flex items-center text-[9px] text-base-content/20 border border-base-content/[0.08] rounded px-1.5 py-0.5">esc</kbd>
        </div>

        {/* Results */}
        <div class="max-h-[60vh] sm:max-h-[50vh] overflow-y-auto">
          <Show when={query().trim().length >= 2}>
            <Show when={!loading() && results().length === 0}>
              <div class="px-4 py-8 text-center text-sm text-base-content/25">
                Sin resultados para "{query()}"
              </div>
            </Show>

            <Show when={results().length > 0}>
              <div class="py-1">
                <For each={results()}>
                  {(story, i) => {
                    const proj = story.project_id ? data.getProjectById(story.project_id) : null;
                    const match = () => matchField(story, query());

                    return (
                      <button
                        onClick={() => select(story)}
                        onMouseEnter={() => setActiveIdx(i())}
                        class={`w-full flex items-start gap-3 px-4 py-3 sm:py-2.5 text-left transition-colors ${
                          activeIdx() === i()
                            ? 'bg-base-content/5'
                            : 'hover:bg-base-content/[0.03]'
                        }`}
                      >
                        <div class={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${statusDot[story.status] ?? 'bg-base-content/20'}`} />
                        <div class="flex-1 min-w-0 space-y-0.5">
                          <div class="flex items-center gap-2">
                            <Show when={story.code}>
                              <span class="text-[9px] font-mono font-bold text-base-content/25">{story.code}</span>
                            </Show>
                            <span class="text-sm font-medium truncate">{highlight(story.title, query())}</span>
                          </div>
                          <Show when={match()}>
                            <p class="text-[11px] text-base-content/30 truncate">
                              {highlight(match()!, query())}
                            </p>
                          </Show>
                        </div>
                        <Show when={proj}>
                          <span
                            class="text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 mt-0.5"
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
            <div class="px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:pb-8 text-center space-y-2">
              <p class="text-sm text-base-content/25">Busca por título, descripción, objetivo o código</p>
              <div class="hidden sm:flex items-center justify-center gap-2 text-[10px] text-base-content/15">
                <kbd class="border border-base-content/[0.08] rounded px-1.5 py-0.5">↑↓</kbd>
                <span>navegar</span>
                <kbd class="border border-base-content/[0.08] rounded px-1.5 py-0.5">↵</kbd>
                <span>abrir</span>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
