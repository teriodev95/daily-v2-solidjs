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

const MAX_VISIBLE_TAGS = 6;

const WikiPage: Component<Props> = (props) => {
  const data = useData();

  const activeProjects = () => data.projects().filter(p => p.status === 'active');
  const [selectedProjectId, setSelectedProjectId] = createSignal<string>(activeProjects()[0]?.id ?? '');
  const [selectedTag, setSelectedTag] = createSignal<string | null>(null);
  const [selectedArticle, setSelectedArticle] = createSignal<WikiArticle | null>(null);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [showGraph, setShowGraph] = createSignal(false);
  const [showAllTags, setShowAllTags] = createSignal(false);

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

  const visibleTags = () => showAllTags() ? allTags() : allTags().slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = () => Math.max(0, allTags().length - MAX_VISIBLE_TAGS);

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
    <>
      {/* ── Row 1: Header ── */}
      <div class="flex items-center gap-3 mb-4">
        <div class="flex items-center gap-2 shrink-0">
          <div class="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <BookOpen size={14} class="text-purple-500" />
          </div>
          <span class="text-[13px] font-bold">Wiki</span>
          <Show when={selectedProject()}>
            <span class="text-[10px] font-semibold text-base-content/25">· {selectedProject()!.name}</span>
          </Show>
        </div>

        {/* Search */}
        <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-base-content/[0.03] border border-base-content/[0.04] max-w-[200px] flex-1">
          <Search size={11} class="text-base-content/20 shrink-0" />
          <input
            type="text"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Buscar..."
            class="bg-transparent outline-none text-[11px] flex-1 placeholder:text-base-content/20"
          />
          <Show when={searchQuery()}>
            <button onClick={() => setSearchQuery('')} class="text-base-content/20 hover:text-base-content/50"><X size={10} /></button>
          </Show>
        </div>

        {/* Actions — right aligned */}
        <div class="flex items-center gap-1 ml-auto shrink-0">
          <button
            onClick={() => setShowGraph(v => !v)}
            class={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
              showGraph() ? 'bg-purple-500/15 text-purple-500' : 'bg-base-content/[0.03] text-base-content/30 hover:text-base-content/50'
            }`}
          >
            <Network size={11} /> Grafo
          </button>
          <button
            onClick={createArticle}
            class="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 text-purple-500 text-[10px] font-semibold hover:bg-purple-500/20 transition-all"
          >
            <Plus size={11} /> Nuevo
          </button>
        </div>
      </div>

      {/* ── Row 2: Projects | Tags ── */}
      <div class="flex items-center gap-2 mb-4 overflow-x-auto">
        {/* Projects */}
        <For each={activeProjects()}>
          {(p) => {
            const active = () => selectedProjectId() === p.id;
            return (
              <button
                onClick={() => { setSelectedProjectId(p.id); setSelectedTag(null); setShowAllTags(false); }}
                class={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-all shrink-0 ${
                  active() ? '' : 'opacity-30 hover:opacity-60'
                }`}
                style={{ "background-color": active() ? `${p.color}10` : 'transparent', color: p.color }}
              >
                <div class="w-3 h-3 rounded-sm shrink-0 flex items-center justify-center text-[6px] font-bold text-white" style={{ "background-color": p.color }}>
                  {p.prefix.slice(0, 2)}
                </div>
                {p.name}
              </button>
            );
          }}
        </For>

        <Show when={allTags().length > 0}>
          <div class="w-px h-3.5 bg-base-content/[0.06] shrink-0" />
        </Show>

        {/* Tags */}
        <Show when={allTags().length > 0}>
          <For each={visibleTags()}>
            {(tag) => (
              <button
                onClick={() => setSelectedTag(selectedTag() === tag ? null : tag)}
                class={`text-[9px] font-semibold px-1.5 py-0.5 rounded transition-all shrink-0 ${
                  selectedTag() === tag
                    ? 'bg-purple-500/15 text-purple-500'
                    : 'bg-base-content/[0.03] text-base-content/25 hover:text-base-content/40'
                }`}
              >
                {tag}
              </button>
            )}
          </For>
          <Show when={hiddenTagCount() > 0 && !showAllTags()}>
            <button onClick={() => setShowAllTags(true)} class="text-[9px] font-semibold text-base-content/20 hover:text-base-content/40 shrink-0">
              +{hiddenTagCount()}
            </button>
          </Show>
          <Show when={showAllTags() && hiddenTagCount() > 0}>
            <button onClick={() => setShowAllTags(false)} class="text-[9px] font-semibold text-base-content/20 hover:text-base-content/40 shrink-0">
              menos
            </button>
          </Show>
        </Show>
      </div>

      {/* ── Graph ── */}
      <Show when={showGraph() && selectedProjectId()}>
        <div class="mb-4 h-[calc(100vh-220px)] min-h-[300px]">
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

      {/* ── Articles ── */}
      <Show when={!showGraph()}>
        <div class="space-y-0.5">
          <For each={filteredArticles()}>
            {(article) => (
              <div
                onClick={() => setSelectedArticle(article)}
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-base-content/[0.03] cursor-pointer transition-all group"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-[13px] font-medium truncate text-base-content/70 group-hover:text-base-content/90 transition-colors">{article.title}</p>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <For each={article.tags.slice(0, 3)}>
                      {(tag) => (
                        <span class="text-[8px] font-semibold px-1 py-px rounded bg-base-content/[0.03] text-base-content/20">{tag}</span>
                      )}
                    </For>
                    <Show when={article.tags.length > 3}>
                      <span class="text-[8px] text-base-content/15">+{article.tags.length - 3}</span>
                    </Show>
                    <span class="text-[9px] text-base-content/15 ml-auto shrink-0">{timeAgo(article.updated_at)}</span>
                  </div>
                </div>
              </div>
            )}
          </For>

          <Show when={!articles.loading && filteredArticles().length === 0}>
            <div class="text-center py-16">
              <BookOpen size={24} class="text-base-content/8 mx-auto mb-2" />
              <p class="text-[12px] text-base-content/20 mb-2">
                {searchQuery() || selectedTag() ? 'Sin resultados' : 'Sin artículos aún'}
              </p>
              <button onClick={createArticle} class="text-[10px] font-semibold text-purple-500/60 hover:text-purple-500 transition-colors">
                Crear el primero →
              </button>
            </div>
          </Show>
        </div>
      </Show>

      {/* ── Article detail (fullscreen) ── */}
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
    </>
  );
};

export default WikiPage;
