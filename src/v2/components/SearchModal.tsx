import { createSignal, createMemo, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import { api, type SearchHit, type SearchHitType } from '../lib/api';
import {
  Search, X, ClipboardList, BookOpen, Users, FolderKanban,
  Lock, GraduationCap, Flag, Brain, CornerDownLeft,
} from 'lucide-solid';

interface Props {
  onClose: () => void;
  onSelect: (hit: SearchHit) => void;
}

/** Orden de las secciones: lo que más se busca, primero. */
const TYPE_ORDER: SearchHitType[] = [
  'story', 'wiki', 'secret', 'person', 'project', 'assignment', 'learning', 'alma',
];

const TYPE_META: Record<SearchHitType, { label: string; icon: any; tone: string }> = {
  story:      { label: 'Historias',    icon: ClipboardList,  tone: 'text-ios-blue-500' },
  wiki:       { label: 'Wiki',         icon: BookOpen,       tone: 'text-amber-500' },
  secret:     { label: 'Secretos',     icon: Lock,           tone: 'text-red-400' },
  person:     { label: 'Personas',     icon: Users,          tone: 'text-purple-400' },
  project:    { label: 'Proyectos',    icon: FolderKanban,   tone: 'text-teal-400' },
  assignment: { label: 'Encomiendas',  icon: Flag,           tone: 'text-pink-400' },
  learning:   { label: 'Aprendizajes', icon: GraduationCap,  tone: 'text-ios-green-500' },
  alma:       { label: 'Alma',         icon: Brain,          tone: 'text-indigo-400' },
};

/** Resalta la coincidencia sin recurrir a innerHTML. */
const Highlight: Component<{ text: string; query: string }> = (props) => {
  const idx = () => props.text.toLowerCase().indexOf(props.query.toLowerCase());
  return (
    <Show when={props.query && idx() >= 0} fallback={<>{props.text}</>}>
      <>
        {props.text.slice(0, idx())}
        <mark class="rounded-sm bg-ios-blue-500/25 px-px text-inherit">
          {props.text.slice(idx(), idx() + props.query.length)}
        </mark>
        {props.text.slice(idx() + props.query.length)}
      </>
    </Show>
  );
};

const SearchModal: Component<Props> = (props) => {
  const [query, setQuery] = createSignal('');
  const [hits, setHits] = createSignal<SearchHit[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [activeIdx, setActiveIdx] = createSignal(0);

  let inputRef!: HTMLInputElement;
  let listRef: HTMLDivElement | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let requestSeq = 0;

  onMount(() => inputRef.focus());
  onCleanup(() => clearTimeout(debounce));

  // Agrupa conservando el orden de secciones, y aplana para que el teclado
  // recorra una sola lista aunque visualmente estén separadas.
  const groups = createMemo(() => {
    const byType = new Map<SearchHitType, SearchHit[]>();
    for (const hit of hits()) {
      const list = byType.get(hit.type) ?? [];
      list.push(hit);
      byType.set(hit.type, list);
    }
    return TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({ type: t, items: byType.get(t)! }));
  });

  const flat = createMemo(() => groups().flatMap((g) => g.items));

  const doSearch = (q: string) => {
    clearTimeout(debounce);
    if (q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce = setTimeout(async () => {
      // Descarta respuestas de peticiones ya superadas: al teclear rápido, una
      // lenta podía pisar a la última y mostrar resultados de otra consulta.
      const seq = ++requestSeq;
      try {
        const res = await api.search.all(q.trim());
        if (seq !== requestSeq) return;
        setHits(res.results);
        setActiveIdx(0);
      } catch {
        if (seq === requestSeq) setHits([]);
      } finally {
        if (seq === requestSeq) setLoading(false);
      }
    }, 220);
  };

  const select = (hit: SearchHit) => {
    props.onSelect(hit);
    props.onClose();
  };

  const move = (delta: number) => {
    const total = flat().length;
    if (total === 0) return;
    const next = (activeIdx() + delta + total) % total;
    setActiveIdx(next);
    listRef?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = flat()[activeIdx()];
      if (hit) select(hit);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
    }
  };

  const indexOfHit = (hit: SearchHit) => flat().indexOf(hit);
  const searching = () => query().trim().length >= 2;

  return (
    <div
      class="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-md duration-200 animate-in fade-in sm:items-start sm:pt-[12vh]"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div
        class="w-full overflow-hidden rounded-t-[24px] border border-base-content/[0.06] bg-base-100 shadow-2xl shadow-black/50 duration-300 animate-in slide-in-from-bottom-8 sm:max-w-2xl sm:rounded-[24px] sm:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Campo */}
        <div class="group relative flex h-16 items-center gap-3 border-b border-base-content/[0.06] px-5 sm:h-[60px]">
          <Search size={18} strokeWidth={2.5} class="shrink-0 text-base-content/30" />
          <input
            ref={inputRef}
            value={query()}
            onInput={(e) => { setQuery(e.currentTarget.value); doSearch(e.currentTarget.value); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar en todo Daily Check..."
            class="flex-1 bg-transparent text-[16px] font-bold tracking-tight outline-none transition-colors placeholder:text-base-content/20 focus:text-base-content sm:text-[15px]"
          />
          <Show when={loading()}>
            <span class="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-base-content/15 border-t-ios-blue-500" />
          </Show>
          <Show when={query()}>
            <button
              type="button"
              onClick={() => { setQuery(''); setHits([]); inputRef.focus(); }}
              aria-label="Limpiar búsqueda"
              class="rounded-xl p-2 text-base-content/30 transition-all hover:bg-base-content/[0.04] hover:text-base-content/60"
            >
              <X size={15} />
            </button>
          </Show>
        </div>

        {/* Resultados */}
        <div ref={listRef} class="max-h-[60vh] overflow-y-auto sm:max-h-[52vh]">
          {/* Estado inicial: decir qué se puede buscar es la mitad del affordance */}
          <Show when={!searching()}>
            <div class="px-5 py-8">
              <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/25">
                Busca en
              </p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <For each={TYPE_ORDER}>
                  {(type) => {
                    const meta = TYPE_META[type];
                    return (
                      <span class="inline-flex items-center gap-1.5 rounded-lg bg-base-content/[0.04] px-2.5 py-1.5 text-[12px] font-semibold text-base-content/55">
                        <meta.icon size={12} class={meta.tone} />
                        {meta.label}
                      </span>
                    );
                  }}
                </For>
              </div>
              <p class="mt-4 text-[12px] leading-relaxed text-base-content/35">
                Escribe al menos dos letras. Busca por título, código, contenido, clave o etiqueta.
              </p>
            </div>
          </Show>

          {/* Sin resultados */}
          <Show when={searching() && !loading() && flat().length === 0}>
            <div class="px-6 py-14 text-center">
              <p class="text-[13px] font-bold tracking-wide text-base-content/45">
                Sin resultados para «{query().trim()}»
              </p>
              <p class="mx-auto mt-1.5 max-w-xs text-[12px] leading-relaxed text-base-content/30">
                Revisa la ortografía o prueba con una palabra más corta.
              </p>
            </div>
          </Show>

          {/* Agrupados por tipo */}
          <Show when={flat().length > 0}>
            <div class="py-2">
              <For each={groups()}>
                {(group) => {
                  const meta = TYPE_META[group.type];
                  return (
                    <div class="mb-1">
                      <div class="flex items-center gap-2 px-5 py-1.5">
                        <meta.icon size={12} class={meta.tone} />
                        <span class="text-[10px] font-bold uppercase tracking-[0.14em] text-base-content/30">
                          {meta.label}
                        </span>
                        <span class="text-[10px] font-bold text-base-content/20">{group.items.length}</span>
                      </div>
                      <For each={group.items}>
                        {(hit) => {
                          const idx = () => indexOfHit(hit);
                          const active = () => idx() === activeIdx();
                          return (
                            <button
                              type="button"
                              data-idx={idx()}
                              onClick={() => select(hit)}
                              onMouseEnter={() => setActiveIdx(idx())}
                              class={`flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors ${
                                active() ? 'bg-ios-blue-500/[0.09]' : 'hover:bg-base-content/[0.03]'
                              }`}
                            >
                              <div class="min-w-0 flex-1">
                                <p class="truncate text-[13.5px] font-semibold text-base-content/85">
                                  <Highlight text={hit.title} query={query().trim()} />
                                </p>
                                <Show when={hit.subtitle || hit.extra}>
                                  <p class="mt-0.5 truncate text-[11px] text-base-content/35">
                                    {[hit.subtitle, hit.extra].filter(Boolean).join(' · ')}
                                  </p>
                                </Show>
                              </div>
                              <Show when={active()}>
                                <CornerDownLeft size={13} class="shrink-0 text-base-content/30" />
                              </Show>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>

        {/* Pie con los atajos: el teclado deja de ser un secreto */}
        <div class="flex items-center gap-4 border-t border-base-content/[0.06] px-5 py-2.5 text-[10px] font-semibold text-base-content/30">
          <span class="flex items-center gap-1"><kbd class="rounded bg-base-content/[0.06] px-1.5 py-0.5 font-mono">↑↓</kbd> navegar</span>
          <span class="flex items-center gap-1"><kbd class="rounded bg-base-content/[0.06] px-1.5 py-0.5 font-mono">↵</kbd> abrir</span>
          <span class="flex items-center gap-1"><kbd class="rounded bg-base-content/[0.06] px-1.5 py-0.5 font-mono">esc</kbd> cerrar</span>
          <Show when={flat().length > 0}>
            <span class="ml-auto tabular-nums">{flat().length} resultados</span>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
