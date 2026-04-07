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

  return (
    <div class="max-w-4xl mx-auto px-4 sm:px-8 py-6">
      {/* Header */}
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center">
            <BookOpen size={18} class="text-purple-500" />
          </div>
          <h1 class="text-lg font-bold">Wiki</h1>
        </div>
        <div class="flex items-center gap-2">
          <button
            onClick={() => setShowGraph(v => !v)}
            class={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all ${
              showGraph()
                ? 'bg-purple-500/15 text-purple-500 border border-purple-500/20'
                : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
            }`}
          >
            <Network size={14} /> Grafo
          </button>
          <button
            onClick={createArticle}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500 text-white text-[12px] font-bold hover:brightness-110 transition-all shadow-sm shadow-purple-500/20"
          >
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      {/* Project selector */}
      <div class="flex items-center gap-2 mb-4 flex-wrap">
        <For each={activeProjects()}>
          {(p) => (
            <button
              onClick={() => { setSelectedProjectId(p.id); setSelectedTag(null); }}
              class={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all ${
                selectedProjectId() === p.id
                  ? 'shadow-sm'
                  : 'opacity-40 hover:opacity-70'
              }`}
              style={{
                "background-color": selectedProjectId() === p.id ? `${p.color}15` : 'transparent',
                color: p.color,
                ...(selectedProjectId() === p.id ? { "box-shadow": `inset 0 0 0 1px ${p.color}30` } : {}),
              }}
            >
              <div class="w-4 h-4 rounded shrink-0 flex items-center justify-center text-[8px] font-bold text-white" style={{ "background-color": p.color }}>
                {p.prefix.slice(0, 2)}
              </div>
              {p.name}
            </button>
          )}
        </For>
      </div>

      {/* Search + tag filters */}
      <div class="flex items-center gap-2 mb-4 flex-wrap">
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-base-content/[0.04] flex-1 min-w-[200px] max-w-xs">
          <Search size={13} class="text-base-content/30" />
          <input
            type="text"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Buscar artículos..."
            class="bg-transparent outline-none text-[12px] flex-1 placeholder:text-base-content/25"
          />
          <Show when={searchQuery()}>
            <button onClick={() => setSearchQuery('')} class="text-base-content/30 hover:text-base-content/60">
              <X size={12} />
            </button>
          </Show>
        </div>
        <Show when={allTags().length > 0}>
          <div class="flex items-center gap-1 flex-wrap">
            <For each={allTags()}>
              {(tag) => (
                <button
                  onClick={() => setSelectedTag(selectedTag() === tag ? null : tag)}
                  class={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-all ${
                    selectedTag() === tag
                      ? 'bg-purple-500/20 text-purple-500'
                      : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
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
        <div class="mb-4 h-[500px]">
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
      <div class="space-y-2">
        <For each={filteredArticles()}>
          {(article) => (
            <div
              onClick={() => setSelectedArticle(article)}
              class="flex items-start gap-3 px-4 py-3 rounded-xl bg-base-200/60 hover:bg-base-200/90 cursor-pointer transition-all group"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold truncate">{article.title}</p>
                <div class="flex items-center gap-2 mt-1">
                  <Show when={article.tags.length > 0}>
                    <div class="flex items-center gap-1">
                      <For each={article.tags}>
                        {(tag) => (
                          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500/70">{tag}</span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <span class="text-[10px] text-base-content/25">{timeAgo(article.updated_at)}</span>
                </div>
              </div>
              <Show when={article.content}>
                <span class="text-[10px] text-base-content/20 mt-1">📝</span>
              </Show>
            </div>
          )}
        </For>
        <Show when={!articles.loading && filteredArticles().length === 0}>
          <div class="text-center py-12">
            <BookOpen size={32} class="text-base-content/10 mx-auto mb-3" />
            <p class="text-sm text-base-content/30">
              {searchQuery() || selectedTag() ? 'Sin resultados' : 'Sin artículos aún'}
            </p>
            <button
              onClick={createArticle}
              class="mt-3 text-[12px] font-bold text-purple-500 hover:underline"
            >
              Crear el primero
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
