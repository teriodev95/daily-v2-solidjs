import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import type { WikiArticle } from '../types';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { BookOpen, Plus, Search, X, Network } from 'lucide-solid';
import WikiArticleDetail from '../components/WikiArticleDetail';
import WikiGraph from '../components/WikiGraph';

interface Props {
  refreshKey?: number;
}

const WikiPage: Component<Props> = (props) => {
  const data = useData();

  const activeProjects = () => data.projects().filter(p => p.status === 'active');
  const [selectedProjectId, setSelectedProjectId] = createSignal<string>(activeProjects()[0]?.id ?? '');
  const [selectedTag, setSelectedTag] = createSignal<string | null>(null);
  const [selectedArticle, setSelectedArticle] = createSignal<WikiArticle | null>(null);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [showGraph, setShowGraph] = createSignal(false);

  const [articles, { refetch }] = createResource(
    () => ({ pid: selectedProjectId(), tag: selectedTag(), _r: props.refreshKey }),
    ({ pid, tag }) => pid ? api.wiki.list(pid, tag ?? undefined) : Promise.resolve([]),
  );

  const allTags = () => {
    const set = new Set<string>();
    for (const a of (articles() ?? []) as WikiArticle[]) {
      for (const t of a.tags) set.add(t);
    }
    return [...set].sort();
  };

  const filteredArticles = () => {
    const q = searchQuery().toLowerCase();
    const list = (articles() ?? []) as WikiArticle[];
    if (!q) return list;
    return list.filter(a => a.title.toLowerCase().includes(q) || a.tags.some(t => t.includes(q)));
  };

  const createArticle = async () => {
    const pid = selectedProjectId();
    if (!pid) return;
    try {
      const created = await api.wiki.create({ project_id: pid, title: 'Nuevo artículo' });
      refetch();
      setSelectedArticle(created as WikiArticle);
    } catch {}
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `hace ${days}d`;
    return `hace ${Math.floor(days / 7)}sem`;
  };

  const selectedProject = () => activeProjects().find(p => p.id === selectedProjectId());

  return (
    <div class="max-w-3xl mx-auto px-6 sm:px-8 py-8">

      {/* Header — título + acciones alineados */}
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <BookOpen size={16} class="text-purple-500" />
          </div>
          <div>
            <h1 class="text-base font-bold leading-tight">Wiki</h1>
            <Show when={selectedProject()}>
              <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 leading-tight">{selectedProject()!.name}</p>
            </Show>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            onClick={() => setShowGraph(v => !v)}
            class={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              showGraph()
                ? 'bg-purple-500/15 text-purple-500'
                : 'bg-base-content/[0.04] text-base-content/35 hover:bg-base-content/[0.07] hover:text-base-content/50'
            }`}
          >
            <Network size={13} />
            Grafo
          </button>
          <button
            onClick={createArticle}
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 text-purple-500 text-[11px] font-semibold hover:bg-purple-500/20 transition-all"
          >
            <Plus size={13} />
            Nuevo
          </button>
        </div>
      </div>

      {/* Project selector — compacto, horizontal */}
      <div class="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1">
        <For each={activeProjects()}>
          {(p) => {
            const active = () => selectedProjectId() === p.id;
            return (
              <button
                onClick={() => { setSelectedProjectId(p.id); setSelectedTag(null); }}
                class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all shrink-0 ${
                  active() ? '' : 'opacity-35 hover:opacity-60'
                }`}
                style={{
                  "background-color": active() ? `${p.color}12` : 'transparent',
                  color: p.color,
                }}
              >
                <div
                  class="w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center text-[7px] font-bold text-white"
                  style={{ "background-color": p.color }}
                >
                  {p.prefix.slice(0, 2)}
                </div>
                {p.name}
              </button>
            );
          }}
        </For>
      </div>

      {/* Search + tags — misma línea, proporcionado */}
      <div class="flex items-center gap-3 mb-5">
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-content/[0.03] border border-base-content/[0.05] w-full max-w-[280px]">
          <Search size={13} class="text-base-content/25 shrink-0" />
          <input
            type="text"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Buscar..."
            class="bg-transparent outline-none text-[12px] flex-1 placeholder:text-base-content/20"
          />
          <Show when={searchQuery()}>
            <button onClick={() => setSearchQuery('')} class="text-base-content/25 hover:text-base-content/50">
              <X size={11} />
            </button>
          </Show>
        </div>
        <Show when={allTags().length > 0}>
          <div class="flex items-center gap-1 flex-wrap">
            <For each={allTags()}>
              {(tag) => (
                <button
                  onClick={() => setSelectedTag(selectedTag() === tag ? null : tag)}
                  class={`text-[10px] font-semibold px-2 py-0.5 rounded transition-all ${
                    selectedTag() === tag
                      ? 'bg-purple-500/15 text-purple-500'
                      : 'bg-base-content/[0.04] text-base-content/30 hover:bg-base-content/[0.07] hover:text-base-content/50'
                  }`}
                >
                  {tag}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Graph view */}
      <Show when={showGraph() && selectedProjectId()}>
        <div class="mb-6 h-[450px]">
          <WikiGraph
            projectId={selectedProjectId()}
            onSelectArticle={(id) => {
              const list = (articles() ?? []) as WikiArticle[];
              const found = list.find(a => a.id === id);
              if (found) setSelectedArticle(found);
            }}
            onClose={() => setShowGraph(false)}
          />
        </div>
      </Show>

      {/* Articles list */}
      <div class="space-y-1.5">
        <For each={filteredArticles()}>
          {(article) => (
            <div
              onClick={() => setSelectedArticle(article)}
              class="flex items-center gap-3 px-4 py-3 rounded-xl bg-base-content/[0.02] hover:bg-base-content/[0.05] border border-transparent hover:border-base-content/[0.06] cursor-pointer transition-all"
            >
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold truncate text-base-content/80">{article.title}</p>
                <div class="flex items-center gap-2 mt-1">
                  <Show when={article.tags.length > 0}>
                    <div class="flex items-center gap-1">
                      <For each={article.tags}>
                        {(tag) => (
                          <span class="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-base-content/[0.04] text-base-content/30">{tag}</span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <span class="text-[10px] text-base-content/20">{timeAgo(article.updated_at)}</span>
                </div>
              </div>
              <Show when={article.content}>
                <span class="text-[9px] text-base-content/15">📝</span>
              </Show>
            </div>
          )}
        </For>

        <Show when={!articles.loading && filteredArticles().length === 0}>
          <div class="text-center py-16">
            <BookOpen size={28} class="text-base-content/8 mx-auto mb-3" />
            <p class="text-[13px] text-base-content/25 mb-3">
              {searchQuery() || selectedTag() ? 'Sin resultados' : 'Sin artículos aún'}
            </p>
            <button
              onClick={createArticle}
              class="text-[11px] font-semibold text-purple-500/70 hover:text-purple-500 transition-colors"
            >
              Crear el primero →
            </button>
          </div>
        </Show>
      </div>

      {/* Article detail modal */}
      <Show when={selectedArticle()}>
        {(article) => (
          <WikiArticleDetail
            article={article()}
            onClose={() => { setSelectedArticle(null); refetch(); }}
            onUpdated={(id, fields) => {
              setSelectedArticle(prev => prev ? { ...prev, ...fields, tags: fields.tags ?? prev.tags } as WikiArticle : prev);
            }}
            onDeleted={() => { setSelectedArticle(null); refetch(); }}
            onNavigate={async (targetTitle) => {
              const list = (articles() ?? []) as WikiArticle[];
              const found = list.find(a => a.title.toLowerCase() === targetTitle.toLowerCase());
              if (found) {
                setSelectedArticle(found);
              } else {
                try {
                  const created = await api.wiki.create({ project_id: selectedProjectId(), title: targetTitle });
                  refetch();
                  setSelectedArticle(created as WikiArticle);
                } catch {}
              }
            }}
          />
        )}
      </Show>
    </div>
  );
};

export default WikiPage;
