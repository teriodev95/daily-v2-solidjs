import { createSignal, createResource, For, Show, onCleanup, type Component } from 'solid-js';
import type { WikiArticle } from '../types';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { BookOpen, Plus, Search, X, Network, Settings, Archive, Trash2 } from 'lucide-solid';
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
  const [settings, setSettings] = createSignal<Record<string, string>>({});
  const [currentUser, setCurrentUser] = createSignal<{ role: string } | null>(null);
  const [showSettings, setShowSettings] = createSignal(false);
  const [contextMenu, setContextMenu] = createSignal<{ id: string; x: number; y: number } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = createSignal<string | null>(null);
  const [deleting, setDeleting] = createSignal(false);

  const [articles, { refetch }] = createResource(
    () => ({ pid: selectedProjectId(), tag: selectedTag(), _r: props.refreshKey }),
    ({ pid, tag }) => pid ? api.wiki.list(pid, tag ?? undefined) : Promise.resolve([]),
  );

  // Fetch settings + current user for admin toggle
  api.team.getSettings().then(s => setSettings(s)).catch(() => {});
  api.auth.me().then(u => setCurrentUser(u as any)).catch(() => {});

  const allTags = () => {
    const set = new Set<string>();
    for (const a of (articles() ?? []) as WikiArticle[]) {
      for (const t of a.tags) {
        if (t !== '_índice') set.add(t);
      }
    }
    return [...set].sort();
  };

  const visibleTags = () => showAllTags() ? allTags() : allTags().slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = () => Math.max(0, allTags().length - MAX_VISIBLE_TAGS);

  const filteredArticles = () => {
    const q = searchQuery().toLowerCase();
    const list = (articles() ?? []) as WikiArticle[];
    const filtered = q ? list.filter(a => a.title.toLowerCase().includes(q) || a.tags.some(t => t.includes(q))) : [...list];
    // _Índice always first, preserve updated_at DESC for the rest
    return filtered.sort((a, b) => {
      if (a.title === '_Índice') return -1;
      if (b.title === '_Índice') return 1;
      return 0;
    });
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

  const archiveArticle = async (id: string) => {
    try {
      await api.wiki.archive(id, true);
      setContextMenu(null);
      refetch();
    } catch {}
  };

  const deleteArticle = async (id: string) => {
    setDeleting(true);
    try {
      await api.wiki.delete(id);
      setConfirmDeleteId(null);
      setContextMenu(null);
      refetch();
    } catch {}
    setDeleting(false);
  };

  // Close context menu on any click or scroll
  const closeContextMenu = () => { setContextMenu(null); };
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('scroll', closeContextMenu, true);
  onCleanup(() => {
    document.removeEventListener('click', closeContextMenu);
    document.removeEventListener('scroll', closeContextMenu, true);
  });

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
          <Show when={currentUser()?.role === 'admin'}>
            <button
              onClick={() => setShowSettings(true)}
              class="flex items-center justify-center w-7 h-7 rounded-lg bg-base-content/[0.03] text-base-content/25 hover:text-base-content/50 hover:bg-base-content/[0.06] transition-all"
              title="Configuración"
            >
              <Settings size={12} />
            </button>
          </Show>
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
                onClick={() => { setSelectedProjectId(p.id); setSelectedTag(null); setShowAllTags(false); setShowGraph(false); }}
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
            {(article) => {
              const isIndex = () => article.title === '_Índice';
              return (
                <div
                  onClick={() => setSelectedArticle(article)}
                  onContextMenu={(e) => {
                    if (isIndex()) return;
                    e.preventDefault();
                    setConfirmDeleteId(null);
                    setContextMenu({ id: article.id, x: e.clientX, y: e.clientY });
                  }}
                  class={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group ${
                    isIndex() ? 'bg-purple-500/[0.03] hover:bg-purple-500/[0.06]' : 'hover:bg-base-content/[0.03]'
                  }`}
                >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <p class={`text-[13px] font-medium truncate transition-colors ${
                        isIndex()
                          ? 'text-purple-500/70 group-hover:text-purple-500'
                          : 'text-base-content/70 group-hover:text-base-content/90'
                      }`}>
                        {isIndex() ? 'Índice' : article.title}
                      </p>
                      {isIndex() && (
                        <span class="text-[8px] font-bold uppercase tracking-wider px-1 py-px rounded bg-purple-500/10 text-purple-500/40 shrink-0">auto</span>
                      )}
                    </div>
                    <Show when={article.summary}>
                      <p class="text-[10px] text-base-content/25 truncate mt-0.5">{article.summary}</p>
                    </Show>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <For each={article.tags.filter(t => t !== '_índice').slice(0, 3)}>
                        {(tag) => (
                          <span class="text-[8px] font-semibold px-1 py-px rounded bg-base-content/[0.03] text-base-content/20">{tag}</span>
                        )}
                      </For>
                      <Show when={article.tags.filter(t => t !== '_índice').length > 3}>
                        <span class="text-[8px] text-base-content/15">+{article.tags.filter(t => t !== '_índice').length - 3}</span>
                      </Show>
                      <span class="text-[9px] text-base-content/15 ml-auto shrink-0">{timeAgo(article.updated_at)}</span>
                    </div>
                  </div>
                  <Show when={article.librarian_status !== 'done'}>
                    <span class={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      article.librarian_status === 'pending' ? 'bg-base-content/20 animate-pulse' :
                      article.librarian_status === 'processing' ? 'bg-blue-400 animate-pulse' :
                      article.librarian_status === 'error' ? 'bg-red-400' : ''
                    }`} /></Show>
                </div>
              );
            }}
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

      {/* ── Right-click context menu ── */}
      <Show when={contextMenu()}>
        {(menu) => (
          <div
            class="fixed z-[95] bg-base-100 rounded-xl shadow-lg border border-base-content/[0.08] py-1 min-w-[150px]"
            style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { archiveArticle(menu().id); }}
              class="w-full text-left px-3 py-1.5 text-[11px] text-base-content/60 hover:bg-base-content/[0.04] transition-colors flex items-center gap-2"
            >
              <Archive size={12} /> Archivar
            </button>
            <button
              onClick={() => { setContextMenu(null); setConfirmDeleteId(menu().id); }}
              class="w-full text-left px-3 py-1.5 text-[11px] text-red-500/70 hover:bg-red-500/[0.04] transition-colors flex items-center gap-2"
            >
              <Trash2 size={12} /> Eliminar
            </button>
          </div>
        )}
      </Show>

      {/* ── Delete confirmation dialog ── */}
      <Show when={confirmDeleteId()}>
        <div class="fixed inset-0 z-[96] flex items-center justify-center bg-black/20" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteId(null); }}>
          <div class="bg-base-100 rounded-2xl shadow-xl border border-base-content/[0.06] w-full max-w-xs mx-4 p-5">
            <div class="flex items-center gap-2 mb-3">
              <div class="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 size={14} class="text-red-500" />
              </div>
              <p class="text-[13px] font-semibold">Eliminar artículo</p>
            </div>
            <p class="text-[11px] text-base-content/50 mb-4">
              Esta acción es permanente y no se puede deshacer. ¿Continuar?
            </p>
            <div class="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                class="flex-1 text-[11px] font-medium px-3 py-2 rounded-xl bg-base-content/[0.04] text-base-content/60 hover:bg-base-content/[0.08] transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteArticle(confirmDeleteId()!)}
                disabled={deleting()}
                class="flex-1 text-[11px] font-medium px-3 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-50"
              >
                {deleting() ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* ── Settings modal ── */}
      <Show when={showSettings()}>
        <div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/20" onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div class="bg-base-100 rounded-2xl shadow-xl border border-base-content/[0.06] w-full max-w-sm mx-4 overflow-hidden">
            {/* Header */}
            <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.04]">
              <div class="flex items-center gap-2">
                <Settings size={14} class="text-purple-500" />
                <span class="text-[13px] font-bold">Configuración</span>
              </div>
              <button onClick={() => setShowSettings(false)} class="text-base-content/25 hover:text-base-content/50 transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Content */}
            <div class="px-5 py-4">
              {/* Librarian mode */}
              <div class="flex items-start gap-3">
                <div class="flex-1">
                  <p class="text-[12px] font-semibold text-base-content/80">Bibliotecario automático</p>
                  <p class="text-[10px] text-base-content/30 mt-0.5 leading-relaxed">
                    {(settings().librarian_mode ?? 'auto') === 'auto'
                      ? 'Tags y resúmenes se aplican automáticamente sin intervención.'
                      : 'Las sugerencias requieren aprobación manual antes de aplicarse.'}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const current = settings().librarian_mode ?? 'auto';
                    const next = current === 'auto' ? 'approval' : 'auto';
                    try {
                      const updated = await api.team.updateSettings('librarian_mode', next);
                      setSettings(updated);
                    } catch {}
                  }}
                  class={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 mt-0.5 ${
                    (settings().librarian_mode ?? 'auto') === 'auto'
                      ? 'bg-purple-500'
                      : 'bg-base-content/15'
                  }`}
                >
                  <span class={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    (settings().librarian_mode ?? 'auto') === 'auto'
                      ? 'translate-x-[18px]'
                      : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>
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
              // Unmount current → remount with new article (forces ContentEditor re-init)
              setSelectedArticle(null);
              const list = (articles() ?? []) as WikiArticle[];
              const found = list.find(a => a.title.toLowerCase() === targetTitle.toLowerCase());
              if (found) {
                queueMicrotask(() => setSelectedArticle(found));
              } else {
                try {
                  const created = await api.wiki.create({ project_id: selectedProjectId(), title: targetTitle });
                  refetch();
                  queueMicrotask(() => setSelectedArticle(created as WikiArticle));
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
