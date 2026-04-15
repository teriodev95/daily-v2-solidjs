import { createSignal, createResource, For, Show, onCleanup, createMemo, useTransition, type Component } from 'solid-js';
import type { WikiArticle } from '../types';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { BookOpen, Plus, Search, X, Network, Settings, Archive, Trash2, Hash, Ghost, FileText, ChevronRight, Activity, ArrowRight, Loader2 } from 'lucide-solid';
import WikiArticleDetail from '../components/WikiArticleDetail';
import WikiGraph from '../components/WikiGraph';
import TopNavigation from '../components/TopNavigation';
import HeaderSearchBar from '../components/HeaderSearchBar';

interface Props {
  refreshKey?: number;
}

const MAX_VISIBLE_TAGS = 12;

// Pseudo-random deterministic generator for gamified stats
const hashCode = (s: string) => s.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);

const WikiPage: Component<Props> = (props) => {
  const data = useData();
  const [isPending, startTransition] = useTransition();

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

  api.team.getSettings().then(s => setSettings(s)).catch(() => {});
  api.auth.me().then(u => setCurrentUser(u as any)).catch(() => {});

  const allTags = createMemo(() => {
    const set = new Set<string>();
    for (const a of (articles() ?? []) as WikiArticle[]) {
      for (const t of a.tags) {
        if (t !== '_índice') set.add(t);
      }
    }
    return [...set].sort();
  });

  const visibleTags = () => showAllTags() ? allTags() : allTags().slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = () => Math.max(0, allTags().length - MAX_VISIBLE_TAGS);

  const filteredArticles = createMemo(() => {
    const q = searchQuery().toLowerCase();
    const list = (articles() ?? []) as WikiArticle[];
    const filtered = q ? list.filter(a => a.title.toLowerCase().includes(q) || a.tags.some(t => t.includes(q))) : [...list];
    
    return filtered.sort((a, b) => {
      if (a.title === '_Índice') return -1;
      if (b.title === '_Índice') return 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  });

  const recentArticles = createMemo(() => {
    // Top 3 most recently updated (ignoring index for recent view usually, but preserving if small)
    return filteredArticles().filter(a => a.title !== '_Índice').slice(0, 3);
  });

  const indexArticle = createMemo(() => {
    return filteredArticles().find(a => a.title === '_Índice');
  });

  const createArticle = async () => {
    const pid = selectedProjectId();
    if (!pid) return;
    try {
      const created = await api.wiki.create({ project_id: pid, title: 'Nuevo conocimiento' });
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
    if (days === 1) return `ayer`;
    if (days < 7) return `hace ${days}d`;
    return `hace ${Math.floor(days / 7)} sem`;
  };

  const selectedProject = () => activeProjects().find(p => p.id === selectedProjectId());

  return (
    <>
      <TopNavigation
        breadcrumbs={[
          { label: "Wiki Central", icon: <BookOpen size={14} /> },
          ...(selectedProject() ? [{ label: selectedProject()!.name, onClick: () => setSelectedArticle(null) }] : []),
          ...(selectedArticle() ? [{ label: selectedArticle()!.title }] : []),
        ]}
        center={
          <HeaderSearchBar
            value={searchQuery()}
            onInput={setSearchQuery}
            placeholder="Buscar conocimiento..."
            loading={isPending()}
          />
        }
        mobileActions={
          <>
            <button onClick={() => setShowGraph(v => !v)} class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 transition-all" title="Grafo">
              <Network size={16} />
            </button>
            <button onClick={createArticle} class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 transition-all" title="Nuevo artículo">
              <Plus size={16} />
            </button>
          </>
        }
        actions={
          <div class="flex items-center gap-1">
             <button
               onClick={() => setShowGraph(v => !v)}
               class={`flex items-center justify-center w-8 h-8 rounded-xl transition-all shadow-sm border ${
                 showGraph() 
                   ? 'bg-purple-500 border-purple-500 text-white' 
                   : 'bg-base-100 border-base-content/[0.08] text-base-content/60 hover:text-base-content hover:bg-base-content/5'
               }`}
               title="Vista de Grafo Estelar"
             >
               <Network size={14} />
             </button>
             <button
               onClick={async () => {
                 try {
                   const a = await api.wiki.create({ project_id: selectedProjectId(), title: 'Nuevo Documento' });
                   refetch();
                   setSelectedArticle(a as WikiArticle);
                 } catch {}
               }}
               class="flex items-center justify-center w-8 h-8 rounded-xl bg-purple-500 text-white shadow-sm hover:hover:bg-purple-600 transition-all"
               title="Crear Artículo"
             >
               <Plus size={16} />
             </button>
             <button
               onClick={() => setShowSettings(true)}
               class="flex items-center justify-center w-8 h-8 rounded-xl bg-base-100 border border-base-content/[0.08] text-base-content/40 hover:text-base-content transition-all shadow-sm"
               title="Configuración de Wiki"
             >
               <Settings size={14} />
             </button>
          </div>
        }
      />

      <div class="flex flex-col sm:flex-row min-h-[calc(100vh-8rem)] gap-6 sm:gap-10 pt-4 pb-12 w-full max-w-6xl mx-auto">
        
        {/* ── COLLUMNA IZQUIERDA (Sidebar / Cajones Bento Nav) ── */}
        <aside class="w-full sm:w-64 flex flex-col gap-8 shrink-0">
          
          {/* Bento: Gamificación & Stats Generales */}
          <div class="rounded-2xl border border-base-content/[0.08] bg-base-100/40 p-4 shadow-sm relative overflow-hidden">
             <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent pointer-events-none" />
             <div class="flex items-center gap-3 relative z-10">
                <div class="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 shadow-sm border border-purple-500/20">
                  <BookOpen size={20} strokeWidth={2.5} />
                </div>
                <h2 class="text-[17px] font-extrabold tracking-tight text-base-content/90">Wiki Central</h2>
             </div>
          </div>

          {/* Bento: Espacios */}
          <div class="flex flex-col">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.15em] text-base-content/40 mb-3 px-1 flex items-center justify-between">
              Espacios
              <span class="text-[9px] bg-base-content/10 px-1.5 py-0.5 rounded-md text-base-content/60">{activeProjects().length}</span>
            </h3>
            <div class="space-y-1">
              <For each={activeProjects()}>
                {(p) => {
                  const active = () => selectedProjectId() === p.id;
                  
                  return (
                    <button
                      onClick={() => { 
                        startTransition(() => {
                          setSelectedProjectId(p.id); setSelectedTag(null); setShowAllTags(false); setShowGraph(false); setSelectedArticle(null); 
                        });
                      }}
                      class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all group ${
                        active() 
                          ? 'bg-base-content/5 text-base-content' 
                          : 'hover:bg-base-content/[0.03] text-base-content/60 hover:text-base-content/90'
                      }`}
                    >
                      <div class="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[9px] font-black text-white shadow-sm" style={{ "background-color": p.color }}>
                        {p.prefix.slice(0, 2)}
                      </div>
                      <span class={`text-[13px] font-bold truncate transition-colors ${active() ? '' : 'opacity-80'}`}>{p.name}</span>
                      
                      <Show when={active()}>
                         <div class="w-1.5 h-1.5 rounded-full ml-auto opacity-80" style={{ "background-color": p.color }} />
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>

          {/* Bento: Etiquetas */}
          <Show when={allTags().length > 0}>
            <div class="flex flex-col">
              <h3 class="text-[10px] font-bold uppercase tracking-[0.15em] text-base-content/40 mb-3 px-1 flex items-center gap-1.5">
                <Hash size={12} /> Etiquetas
              </h3>
              <div class="flex flex-wrap gap-1.5">
                <For each={visibleTags()}>
                  {(tag) => {
                     const active = () => selectedTag() === tag;
                     return (
                       <button
                         onClick={() => startTransition(() => setSelectedTag(active() ? null : tag))}
                         class={`text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-all border ${
                           active
                             ? 'bg-purple-500/10 border-purple-500/30 text-purple-500 shadow-sm'
                             : 'bg-base-100 border-base-content/[0.06] text-base-content/60 hover:border-base-content/20 hover:text-base-content hover:shadow-sm'
                         }`}
                       >
                         {tag}
                       </button>
                     )
                  }}
                </For>
                <Show when={hiddenTagCount() > 0 && !showAllTags()}>
                  <button onClick={() => setShowAllTags(true)} class="text-[11px] font-semibold px-2 py-1.5 rounded-lg text-base-content/40 hover:text-base-content/70 border border-dashed border-base-content/20">
                    +{hiddenTagCount()} más
                  </button>
                </Show>
                <Show when={showAllTags() && hiddenTagCount() > 0}>
                  <button onClick={() => setShowAllTags(false)} class="text-[11px] font-semibold px-2 py-1.5 rounded-lg text-base-content/40 hover:text-base-content/70 border border-dashed border-base-content/20">
                    Ocultar
                  </button>
                </Show>
              </div>
            </div>
          </Show>

        </aside>

        {/* ── COLLUMNA DERECHA (Main Content / El Conocimiento) ── */}
        <div class="flex-1 min-w-0 flex flex-col pt-2">
          <Show when={selectedArticle()} fallback={
            <>

          <Show when={showGraph() && selectedProjectId()}>
            <div class="mb-4 flex-1 h-[calc(100vh-220px)] min-h-[400px] bg-base-100 rounded-3xl border border-base-content/[0.08] shadow-inner overflow-hidden">
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

          <Show when={!showGraph()}>
            {/* Bento Grid Introductorio */}
            <Show when={!searchQuery() && !selectedTag() && filteredArticles().length > 0}>
               <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                 
                 {/* Índice */}
                 <Show when={indexArticle()}>
                   {(idx) => (
                     <div 
                       onClick={() => setSelectedArticle(idx())}
                       class="col-span-1 sm:col-span-1 p-5 rounded-3xl bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/10 transition-all cursor-pointer flex flex-col justify-center items-center text-center"
                     >
                        <div class="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-500 flex items-center justify-center mb-3 ring-4 ring-purple-500/5 transition-transform">
                          <BookOpen size={18} strokeWidth={2.5} />
                        </div>
                        <h3 class="text-lg font-bold text-base-content/90 tracking-tight leading-tight">Índice Principal</h3>
                     </div>
                   )}
                 </Show>

                 {/* Recientemente Actualizados */}
                 <div class={`col-span-1 p-4 rounded-3xl bg-base-100/50 border border-base-content/[0.06] flex flex-col ${indexArticle() ? 'sm:col-span-2' : 'sm:col-span-3'}`}>
                    <h3 class="text-[11px] font-bold uppercase tracking-[0.15em] text-base-content/30 mb-3 px-1 flex items-center gap-1.5">
                       <Activity size={12} /> Recientes
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                       <For each={recentArticles()}>
                         {(recent) => (
                            <div 
                              onClick={() => setSelectedArticle(recent)}
                              class="p-3 rounded-2xl bg-base-content/[0.02] hover:bg-base-content/[0.04] border border-transparent hover:border-base-content/[0.08] transition-all cursor-pointer group"
                            >
                               <div class="flex items-start justify-between gap-3">
                                  <h4 class="text-[13px] font-semibold text-base-content/80 group-hover:text-base-content truncate flex-1">{recent.title}</h4>
                                  <span class="text-[9px] text-base-content/30 whitespace-nowrap shrink-0 pt-0.5">{timeAgo(recent.updated_at)}</span>
                               </div>
                               <Show when={recent.summary}>
                                 <p class="text-[11px] text-base-content/40 mt-1 line-clamp-1 group-hover:text-base-content/60 transition-colors">{recent.summary}</p>
                               </Show>
                            </div>
                         )}
                       </For>
                    </div>
                 </div>

               </div>
            </Show>

            {/* Listado Principal de Documentos */}
            <div class="flex flex-col flex-1 pl-1">
              <Show when={searchQuery() || selectedTag() || filteredArticles().length > 0}>
                <h3 class="text-[10px] font-bold uppercase tracking-[0.15em] text-base-content/30 mb-3 flex items-center gap-2">
                   <FileText size={12} /> 
                   {searchQuery() ? `Resultados de "${searchQuery()}"` : selectedTag() ? `Etiqueta: ${selectedTag()}` : 'Documentos'}
                   <span class="bg-base-content/10 text-base-content/50 px-1.5 py-0.5 rounded text-[9px]">{filteredArticles().length}</span>
                </h3>
              </Show>

              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                        class={`flex flex-col gap-2 p-3.5 rounded-2xl cursor-pointer transition-all border group relative ${
                          isIndex() ? 'bg-purple-500/[0.04] border-purple-500/[0.08] hover:bg-purple-500/[0.08] hover:border-purple-500/20 shadow-sm' : 'bg-base-100 border-base-content/[0.06] hover:border-base-content/[0.15] hover:shadow-md hover:shadow-base-content/5'
                        }`}
                      >
                        <div class="flex items-start justify-between gap-3">
                          <h4 class={`text-[14px] font-bold leading-snug transition-colors line-clamp-2 ${
                            isIndex() ? 'text-purple-500/90 group-hover:text-purple-500' : 'text-base-content/80 group-hover:text-base-content'
                          }`}>
                            {isIndex() ? 'Índice de Proyecto' : article.title}
                          </h4>
                          <Show when={article.librarian_status !== 'done'}>
                            <span class={`w-2 h-2 rounded-full shrink-0 shadow-sm mt-1 ${
                              article.librarian_status === 'pending' ? 'bg-amber-400 animate-pulse' :
                              article.librarian_status === 'processing' ? 'bg-blue-400 animate-pulse' :
                              article.librarian_status === 'error' ? 'bg-red-400' : ''
                            }`} />
                          </Show>
                        </div>
                        
                        <Show when={article.summary}>
                          <p class="text-[11px] text-base-content/40 line-clamp-2 leading-relaxed">{article.summary}</p>
                        </Show>

                        <div class="flex items-center flex-wrap gap-1 mt-auto pt-2">
                          <For each={article.tags.filter(t => t !== '_índice').slice(0, 3)}>
                            {(tag) => (
                              <span class="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-base-content/5 text-base-content/50">{tag}</span>
                            )}
                          </For>
                          <Show when={article.tags.filter(t => t !== '_índice').length > 3}>
                            <span class="text-[9px] text-base-content/30 ml-0.5 font-medium">+{article.tags.filter(t => t !== '_índice').length - 3}</span>
                          </Show>
                          
                          <span class="text-[9px] font-medium text-base-content/25 ml-auto flex items-center gap-1 shrink-0">
                            {timeAgo(article.updated_at)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>

              {/* Estado Vacío (Empty State) Hermoso */}
              <Show when={!articles.loading && filteredArticles().length === 0}>
                <div class="flex flex-col items-center justify-center py-20 px-4 text-center mt-8 bg-base-content/[0.02] rounded-3xl border border-dashed border-base-content/[0.08]">
                  <div class="w-16 h-16 mb-5 rounded-full bg-base-content/[0.04] flex items-center justify-center">
                    <Ghost size={32} class="text-base-content/20 shrink-0" strokeWidth={1.5} />
                  </div>
                  <h3 class="text-lg font-bold text-base-content/70 mb-2">
                    {searchQuery() || selectedTag() ? 'Ningún hallazgo' : 'El espacio está en blanco'}
                  </h3>
                  <p class="text-[13px] text-base-content/40 max-w-[280px] leading-relaxed mb-6">
                    {searchQuery() || selectedTag() 
                      ? 'Exploramos todos los rincones de conocimiento, pero no encontramos coincidencias exactas.' 
                      : 'Este espacio de trabajo aún no tiene documentos registrados. ¿Quieres ser el primero en plantar una idea?'
                    }
                  </p>
                  <button 
                    onClick={createArticle} 
                    class="px-5 py-2.5 rounded-xl bg-purple-500 text-white font-bold text-[13px] shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all hover:-translate-y-0.5 active:translate-y-0"
                  >
                    Plantar conocimiento
                  </button>
                </div>
              </Show>
            </div>
          </Show>
          </>
          }>
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
          </Show>

        </div>
      </div>

      {/* ── Context Menu, Settings, Detail (unchanged structure logically, just omitted for brevity from layout context, keeping them absolute/fixed) ── */}
      {/* ── Right-click context menu ── */}
      <Show when={contextMenu()}>
        {(menu) => (
          <div
            class="fixed z-[95] bg-base-100 rounded-xl shadow-xl border border-base-content/[0.1] py-1.5 min-w-[160px] animate-in zoom-in-95 duration-100"
            style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { archiveArticle(menu().id); }}
              class="w-full text-left px-3.5 py-2 text-[12px] font-medium text-base-content/70 hover:bg-base-content/[0.04] hover:text-base-content transition-colors flex items-center gap-2.5"
            >
              <Archive size={14} /> Archivar
            </button>
            <div class="h-px w-full bg-base-content/[0.06] my-1" />
            <button
              onClick={() => { setContextMenu(null); setConfirmDeleteId(menu().id); }}
              class="w-full text-left px-3.5 py-2 text-[12px] font-medium text-red-500/80 hover:bg-red-500/[0.06] hover:text-red-600 transition-colors flex items-center gap-2.5"
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
        )}
      </Show>

      {/* ── Delete confirmation dialog ── */}
      <Show when={confirmDeleteId()}>
        <div class="fixed inset-0 z-[96] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteId(null); }}>
          <div class="bg-base-100 rounded-[24px] shadow-2xl border border-base-content/[0.08] w-full max-w-sm mx-4 p-6 animate-in zoom-in-95">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 size={18} class="text-red-500" />
              </div>
              <div>
                 <p class="text-[16px] font-bold text-base-content/90">Eliminar artículo</p>
              </div>
            </div>
            <p class="text-[13px] text-base-content/60 mb-6 leading-relaxed">
              Esta acción es permanente y destructiva. El conocimiento se perderá y no podrá ser recuperado. ¿Continuar?
            </p>
            <div class="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                class="flex-1 text-[13px] font-bold py-2.5 rounded-xl bg-base-content/[0.04] text-base-content/70 hover:bg-base-content/[0.08] hover:text-base-content transition-all"
              >
                Conservar
              </button>
              <button
                onClick={() => deleteArticle(confirmDeleteId()!)}
                disabled={deleting()}
                class="flex-1 text-[13px] font-bold py-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-500/20 transition-all disabled:opacity-50"
              >
                {deleting() ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* ── Settings modal ── */}
      <Show when={showSettings()}>
        <div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div class="bg-base-100 rounded-[24px] shadow-2xl border border-base-content/[0.08] w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95">
            {/* Header */}
            <div class="flex items-center justify-between px-6 py-5 border-b border-base-content/[0.04] bg-base-content/[0.02]">
              <div class="flex items-center gap-2.5">
                <Settings size={18} class="text-purple-500" strokeWidth={2.5} />
                <span class="text-[16px] font-bold">Configuración de Wiki</span>
              </div>
              <button onClick={() => setShowSettings(false)} class="w-8 h-8 rounded-full flex items-center justify-center text-base-content/40 hover:bg-base-content/10 hover:text-base-content/80 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div class="px-6 py-6">
              <div class="flex items-start gap-4 p-4 rounded-2xl border border-base-content/[0.06] bg-base-100 shadow-sm">
                <div class="flex-1">
                  <p class="text-[14px] font-bold text-base-content/90">Bibliotecario de IA Automático</p>
                  <p class="text-[12px] text-base-content/50 mt-1.5 leading-relaxed">
                    {(settings().librarian_mode ?? 'auto') === 'auto'
                      ? 'La IA genera resúmenes y etiqueta documentos de forma autónoma sin tu interrupción.'
                      : 'La IA sugiere pero espera tu aprobación manual para no sobrescribir nada sin permiso.'}
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
                  class={`relative w-12 h-6 rounded-full transition-all shrink-0 mt-1 shadow-inner ${
                    (settings().librarian_mode ?? 'auto') === 'auto'
                      ? 'bg-purple-500'
                      : 'bg-base-content/15'
                  }`}
                >
                  <span class={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    (settings().librarian_mode ?? 'auto') === 'auto'
                      ? 'translate-x-6'
                      : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
};

export default WikiPage;
