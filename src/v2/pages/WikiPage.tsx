import { createSignal, createResource, For, Show, onCleanup, createMemo, useTransition, type Component } from 'solid-js';
import { useOnceReady } from '../lib/onceReady';
import type { WikiArticle } from '../types';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { useAuth } from '../lib/auth';
import {
  Activity, AlertTriangle, Archive, BookOpen, CircleDot, FileText, Ghost, Hash,
  Link2, ListTree, Network, Plus, Settings, ShieldCheck, Tags, Trash2, X,
} from 'lucide-solid';
import WikiArticleDetail from '../components/WikiArticleDetail';
import WikiGraph from '../components/WikiGraph';
import TopNavigation from '../components/TopNavigation';
import HeaderSearchBar from '../components/HeaderSearchBar';

interface Props {
  refreshKey?: number;
}

const MAX_VISIBLE_TAGS = 12;

type WikiMode = 'index' | 'graph' | 'health';

type IndexEntry = {
  title: string;
  excerpt: string;
  article: WikiArticle | null;
};

type IndexSection = {
  label: string;
  entries: IndexEntry[];
};

const wikiLinkRegex = /\[\[(.+?)(?:\|.+?)?\]\]/g;

const isIndexArticle = (article: WikiArticle) =>
  article.title === '_Índice' ||
  article.title === '_Indice' ||
  article.tags?.includes('_índice') ||
  article.tags?.includes('_indice');

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const normalizeTag = (value: string) =>
  normalize(value).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');

const parseWikiTargets = (content: string) => {
  const targets: string[] = [];
  let match;
  const regex = new RegExp(wikiLinkRegex);
  while ((match = regex.exec(content || '')) !== null) {
    targets.push(match[1].trim());
  }
  return targets;
};

const shortText = (value: string, max = 142) => {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
};

const WikiPage: Component<Props> = (props) => {
  const data = useData();
  const auth = useAuth();
  const [isPending, startTransition] = useTransition();

  const canManageArticle = (article: WikiArticle) => {
    const u = auth.user();
    if (!u) return false;
    return u.role === 'admin' || article.created_by === u.id;
  };

  const activeProjects = () => data.projects().filter(p => p.status === 'active');
  const [selectedProjectId, setSelectedProjectId] = createSignal<string>(activeProjects()[0]?.id ?? '');
  const [selectedTag, setSelectedTag] = createSignal<string | null>(null);
  const [selectedArticle, setSelectedArticle] = createSignal<WikiArticle | null>(null);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [mode, setMode] = createSignal<WikiMode>('index');
  const [showAllTags, setShowAllTags] = createSignal(false);
  const [settings, setSettings] = createSignal<Record<string, string>>({});
  const [showSettings, setShowSettings] = createSignal(false);
  const [contextMenu, setContextMenu] = createSignal<{ id: string; x: number; y: number } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = createSignal<string | null>(null);
  const [deleting, setDeleting] = createSignal(false);

  const [articles, { refetch }] = createResource(
    () => ({ pid: selectedProjectId(), _r: props.refreshKey }),
    ({ pid }) => pid ? api.wiki.list(pid) : Promise.resolve([]),
  );

  // Latch: only show "no hay artículos" once we've loaded at least once.
  // Prevents the empty-state copy from flashing during refetches.
  const articlesReady = useOnceReady(articles);

  api.team.getSettings().then(s => setSettings(s)).catch(() => {});

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

  const allArticles = createMemo(() => (articles() ?? []) as WikiArticle[]);
  const nonIndexArticles = createMemo(() => allArticles().filter((article) => !isIndexArticle(article)));

  const filteredArticles = createMemo(() => {
    const q = normalize(searchQuery());
    const list = allArticles();
    const filtered = q
      ? list.filter((a) =>
          normalize(a.title).includes(q) ||
          normalize(a.summary ?? '').includes(q) ||
          a.tags.some((t) => normalize(t).includes(q)))
      : [...list];
    
    return filtered.sort((a, b) => {
      if (isIndexArticle(a)) return -1;
      if (isIndexArticle(b)) return 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  });

  const recentArticles = createMemo(() => {
    return filteredArticles().filter((a) => !isIndexArticle(a)).slice(0, 3);
  });

  const indexArticle = createMemo(() => {
    return allArticles().find(isIndexArticle);
  });

  const articleByTitle = createMemo(() => {
    const map = new Map<string, WikiArticle>();
    for (const article of allArticles()) {
      map.set(normalize(article.title), article);
    }
    return map;
  });

  const parsedIndexSections = createMemo<IndexSection[]>(() => {
    const index = indexArticle();
    if (!index?.content) return [];

    const sections: IndexSection[] = [];
    let current: IndexSection | null = null;
    const seenEntries = new Set<string>();
    for (const rawLine of index.content.split('\n')) {
      const heading = /^##\s+(.+)$/.exec(rawLine);
      if (heading) {
        current = { label: heading[1].trim(), entries: [] };
        sections.push(current);
        continue;
      }

      const item = /^-\s+\[\[(.+?)(?:\|.+?)?\]\]\s*(?:[—-]\s*)?(.*)$/.exec(rawLine);
      if (!item) continue;
      if (!current) {
        current = { label: 'Documentos', entries: [] };
        sections.push(current);
      }

      const title = item[1].trim();
      const key = normalize(title);
      if (seenEntries.has(key)) continue;
      seenEntries.add(key);
      const article = articleByTitle().get(normalize(title)) ?? null;
      current.entries.push({
        title,
        article,
        excerpt: shortText(item[2] || article?.summary || ''),
      });
    }
    return sections.filter((section) => section.entries.length > 0);
  });

  const visibleIndexSections = createMemo(() => {
    const q = normalize(searchQuery());
    const tag = selectedTag();
    const sections = parsedIndexSections();
    const fallbackEntries = filteredArticles()
      .filter((article) => !isIndexArticle(article))
      .map((article) => ({ title: article.title, article, excerpt: shortText(article.summary ?? '') }));

    let source = sections.length > 0
      ? [...sections]
      : [{ label: tag ?? 'Documentos', entries: fallbackEntries }];

    if (sections.length > 0) {
      const indexedIds = new Set(
        sections.flatMap((section) => section.entries.map((entry) => entry.article?.id).filter(Boolean) as string[]),
      );
      const unclassified = fallbackEntries.filter((entry) => entry.article && !indexedIds.has(entry.article.id));
      if (unclassified.length > 0) {
        source = [...source, { label: 'Sin clasificar', entries: unclassified }];
      }
    }

    return source
      .map((section) => ({
        ...section,
        entries: section.entries.filter((entry) => {
          const article = entry.article;
          if (tag && !article?.tags.includes(tag)) return false;
          if (!q) return true;
          return normalize(entry.title).includes(q) ||
            normalize(entry.excerpt).includes(q) ||
            (article?.tags ?? []).some((t) => normalize(t).includes(q));
        }),
      }))
      .filter((section) => section.entries.length > 0);
  });

  const wikiHealth = createMemo(() => {
    const titleCounts = new Map<string, WikiArticle[]>();
    for (const article of nonIndexArticles()) {
      const key = normalize(article.title);
      titleCounts.set(key, [...(titleCounts.get(key) ?? []), article]);
    }
    const duplicateTitles = [...titleCounts.values()].filter((group) => group.length > 1);

    const tagGroups = new Map<string, Set<string>>();
    for (const article of nonIndexArticles()) {
      for (const tag of article.tags.filter((t) => !t.startsWith('_'))) {
        const key = normalizeTag(tag);
        const group = tagGroups.get(key) ?? new Set<string>();
        group.add(tag);
        tagGroups.set(key, group);
      }
    }
    const tagVariants = [...tagGroups.values()]
      .map((group) => [...group])
      .filter((group) => group.length > 1)
      .slice(0, 8);

    const titleMap = articleByTitle();
    const semanticIncoming = new Map<string, number>();
    const semanticEdges = new Set<string>();
    const brokenLinks: { source: string; target: string }[] = [];
    let indexReferenceCount = 0;
    const indexReferenceTargets = new Set<string>();
    const indexReferencePairs = new Set<string>();
    let duplicateIndexReferences = 0;

    for (const source of allArticles()) {
      for (const targetTitle of parseWikiTargets(source.content || '')) {
        const target = titleMap.get(normalize(targetTitle));
        if (!target) {
          brokenLinks.push({ source: source.title, target: targetTitle });
          continue;
        }
        if (source.id === target.id) continue;

        if (isIndexArticle(source) || isIndexArticle(target)) {
          indexReferenceCount += 1;
          indexReferenceTargets.add(target.id);
          const pairKey = `${source.id}->${target.id}`;
          if (indexReferencePairs.has(pairKey)) duplicateIndexReferences += 1;
          else indexReferencePairs.add(pairKey);
          continue;
        }

        const key = `${source.id}->${target.id}`;
        semanticEdges.add(key);
        semanticIncoming.set(target.id, (semanticIncoming.get(target.id) ?? 0) + 1);
      }
    }

    const withoutBacklinks = nonIndexArticles()
      .filter((article) => (semanticIncoming.get(article.id) ?? 0) === 0);

    const pending = nonIndexArticles().filter((article) => article.librarian_status !== 'done');

    return {
      total: nonIndexArticles().length,
      analyzed: nonIndexArticles().filter((article) => article.librarian_status === 'done').length,
      pending,
      duplicateTitles,
      tagVariants,
      brokenLinksTotal: brokenLinks.length,
      brokenLinks: brokenLinks.slice(0, 12),
      withoutBacklinksTotal: withoutBacklinks.length,
      withoutBacklinks: withoutBacklinks.slice(0, 12),
      semanticLinks: semanticEdges.size,
      indexReferenceCount,
      indexReferenceUnique: indexReferenceTargets.size,
      duplicateIndexReferences,
    };
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

  const openArticleById = async (id: string) => {
    const found = allArticles().find((article) => article.id === id);
    if (found) {
      setSelectedArticle(found);
      return;
    }
    try {
      const loaded = await api.wiki.get(id);
      setSelectedArticle(loaded as WikiArticle);
    } catch {}
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
            <button onClick={() => setMode(mode() === 'graph' ? 'index' : 'graph')} class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 transition-all" title="Grafo">
              <Network size={16} />
            </button>
            <button onClick={createArticle} class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 transition-all" title="Nuevo artículo">
              <Plus size={16} />
            </button>
          </>
        }
        actions={
          <div class="flex items-center gap-1">
             <div class="hidden items-center gap-1 rounded-2xl border border-base-content/[0.08] bg-base-100/80 p-1 shadow-sm sm:flex">
               <button
                 onClick={() => setMode('index')}
                 class={`flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-bold transition-all ${
                   mode() === 'index'
                     ? 'bg-purple-500/12 text-purple-500'
                     : 'text-base-content/45 hover:bg-base-content/[0.05] hover:text-base-content/75'
                 }`}
                 title="Indice"
               >
                 <ListTree size={13} />
                 Indice
               </button>
               <button
                 onClick={() => setMode('graph')}
                 class={`flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-bold transition-all ${
                   mode() === 'graph'
                     ? 'bg-purple-500/12 text-purple-500'
                     : 'text-base-content/45 hover:bg-base-content/[0.05] hover:text-base-content/75'
                 }`}
                 title="Grafo"
               >
                 <Network size={13} />
                 Grafo
               </button>
               <button
                 onClick={() => setMode('health')}
                 class={`flex h-7 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-bold transition-all ${
                   mode() === 'health'
                     ? 'bg-purple-500/12 text-purple-500'
                     : 'text-base-content/45 hover:bg-base-content/[0.05] hover:text-base-content/75'
                 }`}
                 title="Salud de Wiki"
               >
                 <ShieldCheck size={13} />
                 Salud
               </button>
             </div>
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

      <div class="flex flex-col gap-6 pt-4 pb-12 w-full max-w-6xl mx-auto md:grid md:h-[calc(100vh-10rem)] md:min-h-[520px] md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10 md:overflow-hidden md:pb-0">

        {/* ── COLLUMNA IZQUIERDA (Sidebar / Cajones Bento Nav) ── */}
        <aside class="w-full flex flex-col gap-8 shrink-0 md:h-full md:min-h-0 md:overflow-hidden">

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
                          setSelectedProjectId(p.id);
                          setSelectedTag(null);
                          setShowAllTags(false);
                          setMode('index');
                          setSelectedArticle(null);
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
                           active()
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
        <div class="flex-1 min-w-0 flex flex-col pt-2 md:h-full md:min-h-0 md:overflow-x-hidden md:overflow-y-auto md:pb-[calc(7rem+env(safe-area-inset-bottom))] md:pr-1 md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden">
          <div class="mb-4 flex flex-col gap-3">
            <div class="flex flex-col gap-3 rounded-3xl border border-base-content/[0.06] bg-base-100/54 p-4 shadow-sm">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/35">
                    {selectedProject()?.name ?? 'Wiki'}
                  </p>
                  <h2 class="mt-1 text-[19px] font-black leading-tight text-base-content/90">
                    {mode() === 'index' ? 'Indice operativo' : mode() === 'graph' ? 'Grafo de relaciones' : 'Salud del espacio'}
                  </h2>
                  <p class="mt-1 max-w-[620px] text-[12px] font-medium leading-relaxed text-base-content/45">
                    {mode() === 'index'
                      ? 'Catalogo estilo LLM Wiki: encuentra por tema, resumen y etiquetas sin depender del canvas.'
                      : mode() === 'graph'
                        ? 'Explora relaciones semanticas limpias. El indice queda oculto por defecto para no dominar la red.'
                        : 'Detecta duplicados, enlaces rotos, tags equivalentes y documentos que necesitan mantenimiento.'}
                  </p>
                </div>
                <div class="grid grid-cols-3 gap-2 sm:w-[300px]">
                  <div class="rounded-2xl bg-base-content/[0.035] px-3 py-2">
                    <p class="text-[9px] font-bold uppercase tracking-[0.12em] text-base-content/30">Docs</p>
                    <p class="mt-1 text-[17px] font-black text-base-content/82">{wikiHealth().total}</p>
                  </div>
                  <div class="rounded-2xl bg-base-content/[0.035] px-3 py-2">
                    <p class="text-[9px] font-bold uppercase tracking-[0.12em] text-base-content/30">Rel</p>
                    <p class="mt-1 text-[17px] font-black text-base-content/82">{wikiHealth().semanticLinks}</p>
                  </div>
                  <div class="rounded-2xl bg-base-content/[0.035] px-3 py-2">
                    <p class="text-[9px] font-bold uppercase tracking-[0.12em] text-base-content/30">Idx</p>
                    <p class="mt-1 text-[17px] font-black text-base-content/82">{wikiHealth().indexReferenceUnique}</p>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-1 rounded-2xl bg-base-content/[0.035] p-1 sm:hidden">
                <button
                  type="button"
                  onClick={() => setMode('index')}
                  class={`rounded-xl px-2 py-2 text-[11px] font-bold transition-colors ${mode() === 'index' ? 'bg-base-100 text-purple-500 shadow-sm' : 'text-base-content/45'}`}
                >
                  Indice
                </button>
                <button
                  type="button"
                  onClick={() => setMode('graph')}
                  class={`rounded-xl px-2 py-2 text-[11px] font-bold transition-colors ${mode() === 'graph' ? 'bg-base-100 text-purple-500 shadow-sm' : 'text-base-content/45'}`}
                >
                  Grafo
                </button>
                <button
                  type="button"
                  onClick={() => setMode('health')}
                  class={`rounded-xl px-2 py-2 text-[11px] font-bold transition-colors ${mode() === 'health' ? 'bg-base-100 text-purple-500 shadow-sm' : 'text-base-content/45'}`}
                >
                  Salud
                </button>
              </div>
            </div>
          </div>

          <Show when={mode() === 'graph' && selectedProjectId()}>
            <div class="mb-4 h-[min(760px,calc(100svh-220px))] min-h-[460px] overflow-hidden rounded-3xl border border-base-content/[0.08] bg-base-100 shadow-inner">
              <WikiGraph
                projectId={selectedProjectId()}
                onSelectArticle={(id) => void openArticleById(id)}
                onClose={() => setMode('index')}
              />
            </div>
          </Show>

          <Show when={mode() === 'health'}>
            <div class="space-y-4">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div class="rounded-2xl border border-base-content/[0.06] bg-base-100 p-4">
                  <div class="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-base-content/35">
                    <ShieldCheck size={13} />
                    Analizados
                  </div>
                  <p class="text-2xl font-black text-base-content/90">{wikiHealth().analyzed}</p>
                  <p class="mt-1 text-[12px] font-medium text-base-content/40">de {wikiHealth().total} documentos</p>
                </div>
                <div class="rounded-2xl border border-base-content/[0.06] bg-base-100 p-4">
                  <div class="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-base-content/35">
                    <Link2 size={13} />
                    Relaciones
                  </div>
                  <p class="text-2xl font-black text-base-content/90">{wikiHealth().semanticLinks}</p>
                  <p class="mt-1 text-[12px] font-medium text-base-content/40">sin contar el indice</p>
                </div>
                <div class="rounded-2xl border border-base-content/[0.06] bg-base-100 p-4">
                  <div class="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-base-content/35">
                    <AlertTriangle size={13} />
                    Links rotos
                  </div>
                  <p class={`text-2xl font-black ${wikiHealth().brokenLinks.length ? 'text-red-500' : 'text-base-content/90'}`}>
                    {wikiHealth().brokenLinksTotal}
                  </p>
                  <p class="mt-1 text-[12px] font-medium text-base-content/40">referencias sin destino</p>
                </div>
                <div class="rounded-2xl border border-base-content/[0.06] bg-base-100 p-4">
                  <div class="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-base-content/35">
                    <BookOpen size={13} />
                    Indice
                  </div>
                  <p class="text-2xl font-black text-base-content/90">{wikiHealth().indexReferenceCount}</p>
                  <p class="mt-1 text-[12px] font-medium text-base-content/40">
                    {wikiHealth().indexReferenceUnique} destinos unicos · {wikiHealth().duplicateIndexReferences} duplicados
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div class="rounded-3xl border border-base-content/[0.06] bg-base-100 p-4">
                  <h3 class="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/35">
                    <CircleDot size={13} />
                    Sin backlinks semanticos
                    <span class="rounded-md bg-base-content/[0.08] px-1.5 py-0.5 text-[9px]">{wikiHealth().withoutBacklinksTotal}</span>
                  </h3>
                  <div class="space-y-1.5">
                    <For each={wikiHealth().withoutBacklinks} fallback={<p class="text-[12px] font-medium text-base-content/35">Todos los documentos tienen entrada semantica.</p>}>
                      {(article) => (
                        <button
                          type="button"
                          onClick={() => setSelectedArticle(article)}
                          class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-base-content/[0.04]"
                        >
                          <span class="min-w-0 truncate text-[12px] font-semibold text-base-content/70">{article.title}</span>
                          <span class="shrink-0 text-[10px] font-bold text-base-content/30">{timeAgo(article.updated_at)}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                <div class="rounded-3xl border border-base-content/[0.06] bg-base-100 p-4">
                  <h3 class="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/35">
                    <Tags size={13} />
                    Tags equivalentes
                    <span class="rounded-md bg-base-content/[0.08] px-1.5 py-0.5 text-[9px]">{wikiHealth().tagVariants.length}</span>
                  </h3>
                  <div class="space-y-2">
                    <For each={wikiHealth().tagVariants} fallback={<p class="text-[12px] font-medium text-base-content/35">No hay variantes obvias de tags.</p>}>
                      {(group) => (
                        <div class="flex flex-wrap gap-1.5 rounded-xl bg-base-content/[0.025] px-3 py-2">
                          <For each={group}>
                            {(tag) => <span class="rounded-lg bg-base-content/[0.055] px-2 py-1 text-[10px] font-bold text-base-content/55">{tag}</span>}
                          </For>
                        </div>
                      )}
                    </For>
                  </div>
                </div>

                <div class="rounded-3xl border border-base-content/[0.06] bg-base-100 p-4">
                  <h3 class="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/35">
                    <FileText size={13} />
                    Titulos duplicados
                    <span class="rounded-md bg-base-content/[0.08] px-1.5 py-0.5 text-[9px]">{wikiHealth().duplicateTitles.length}</span>
                  </h3>
                  <div class="space-y-2">
                    <For each={wikiHealth().duplicateTitles} fallback={<p class="text-[12px] font-medium text-base-content/35">No hay titulos duplicados.</p>}>
                      {(group) => (
                        <div class="rounded-xl bg-base-content/[0.025] px-3 py-2">
                          <p class="truncate text-[12px] font-bold text-base-content/70">{group[0].title}</p>
                          <p class="mt-1 text-[10px] font-semibold text-base-content/35">{group.length} documentos comparten este titulo</p>
                        </div>
                      )}
                    </For>
                  </div>
                </div>

                <div class="rounded-3xl border border-base-content/[0.06] bg-base-100 p-4">
                  <h3 class="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/35">
                    <AlertTriangle size={13} />
                    Links rotos
                    <span class="rounded-md bg-base-content/[0.08] px-1.5 py-0.5 text-[9px]">{wikiHealth().brokenLinksTotal}</span>
                  </h3>
                  <div class="space-y-1.5">
                    <For each={wikiHealth().brokenLinks} fallback={<p class="text-[12px] font-medium text-base-content/35">No se detectaron enlaces rotos.</p>}>
                      {(link) => (
                        <div class="rounded-xl bg-red-500/[0.055] px-3 py-2">
                          <p class="truncate text-[12px] font-bold text-base-content/70">{link.target}</p>
                          <p class="mt-1 truncate text-[10px] font-semibold text-base-content/35">desde {link.source}</p>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            </div>
          </Show>

          <Show when={mode() === 'index'}>
            <div class="flex flex-col flex-1">
              <Show when={!searchQuery() && !selectedTag() && recentArticles().length > 0}>
                <div class="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Show when={indexArticle()}>
                    {(article) => (
                      <button
                        type="button"
                        onClick={() => setSelectedArticle(article())}
                        class="flex min-h-[112px] flex-col justify-between rounded-3xl border border-purple-500/12 bg-purple-500/[0.055] p-4 text-left transition-colors hover:bg-purple-500/[0.085]"
                      >
                        <BookOpen size={18} class="text-purple-500" strokeWidth={2.5} />
                        <div>
                          <p class="text-[14px] font-black text-base-content/88">Documento indice</p>
                          <p class="mt-1 text-[11px] font-semibold text-base-content/40">{parsedIndexSections().length} secciones</p>
                        </div>
                      </button>
                    )}
                  </Show>
                  <div class={`rounded-3xl border border-base-content/[0.06] bg-base-100 p-4 ${indexArticle() ? 'sm:col-span-2' : 'sm:col-span-3'}`}>
                    <h3 class="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/35">
                      <Activity size={12} />
                      Recientes
                    </h3>
                    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <For each={recentArticles()}>
                        {(recent) => (
                          <button
                            type="button"
                            onClick={() => setSelectedArticle(recent)}
                            class="min-w-0 rounded-2xl bg-base-content/[0.025] px-3 py-2.5 text-left transition-colors hover:bg-base-content/[0.05]"
                          >
                            <div class="flex items-start justify-between gap-3">
                              <h4 class="min-w-0 truncate text-[13px] font-bold text-base-content/75">{recent.title}</h4>
                              <span class="shrink-0 text-[9px] font-semibold text-base-content/30">{timeAgo(recent.updated_at)}</span>
                            </div>
                            <Show when={recent.summary}>
                              <p class="mt-1 line-clamp-1 text-[11px] font-medium text-base-content/38">{recent.summary}</p>
                            </Show>
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              </Show>

              <Show when={visibleIndexSections().length > 0}>
                <div class="space-y-4">
                  <For each={visibleIndexSections()}>
                    {(section) => (
                      <section class="rounded-3xl border border-base-content/[0.06] bg-base-100 p-4">
                        <div class="mb-3 flex items-center justify-between gap-3">
                          <h3 class="min-w-0 truncate text-[12px] font-black uppercase tracking-[0.12em] text-base-content/45">
                            {section.label}
                          </h3>
                          <span class="shrink-0 rounded-lg bg-base-content/[0.06] px-2 py-1 text-[10px] font-bold text-base-content/40">
                            {section.entries.length}
                          </span>
                        </div>
                        <div class="divide-y divide-base-content/[0.055]">
                          <For each={section.entries}>
                            {(entry) => (
                              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0">
                                <button
                                  type="button"
                                  disabled={!entry.article}
                                  onClick={() => entry.article && setSelectedArticle(entry.article)}
                                  class="min-w-0 text-left disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  <div class="flex min-w-0 items-center gap-2">
                                    <span class={`h-2 w-2 shrink-0 rounded-full ${entry.article ? 'bg-purple-500/70' : 'bg-red-500/70'}`} />
                                    <h4 class="min-w-0 truncate text-[14px] font-bold text-base-content/82">
                                      {entry.article && isIndexArticle(entry.article) ? 'Indice de Proyecto' : entry.title}
                                    </h4>
                                  </div>
                                  <Show when={entry.excerpt}>
                                    <p class="mt-1 line-clamp-2 text-[12px] font-medium leading-relaxed text-base-content/42">
                                      {entry.excerpt}
                                    </p>
                                  </Show>
                                  <Show when={entry.article}>
                                    {(article) => (
                                      <div class="mt-2 flex flex-wrap items-center gap-1.5">
                                        <For each={article().tags.filter((tag) => tag !== '_índice').slice(0, 4)}>
                                          {(tag) => <span class="rounded-lg bg-base-content/[0.045] px-1.5 py-0.5 text-[9px] font-bold text-base-content/42">{tag}</span>}
                                        </For>
                                      </div>
                                    )}
                                  </Show>
                                </button>
                                <div class="flex items-center gap-1">
                                  <Show when={entry.article}>
                                    {(article) => (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => setSelectedArticle(article())}
                                          class="rounded-xl bg-base-content/[0.045] px-3 py-1.5 text-[11px] font-bold text-base-content/55 transition-colors hover:bg-base-content/[0.075] hover:text-base-content/80"
                                        >
                                          Abrir
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => { setMode('graph'); setSelectedTag(null); }}
                                          title="Ver grafo"
                                          class="flex h-7 w-7 items-center justify-center rounded-xl text-base-content/35 transition-colors hover:bg-base-content/[0.06] hover:text-base-content/70"
                                        >
                                          <Network size={13} />
                                        </button>
                                      </>
                                    )}
                                  </Show>
                                  <Show when={!entry.article}>
                                    <span class="rounded-xl bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-400">sin doc</span>
                                  </Show>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </section>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={articlesReady() && visibleIndexSections().length === 0}>
                <div class="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed border-base-content/[0.08] bg-base-content/[0.02] px-4 py-20 text-center">
                  <div class="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-base-content/[0.04]">
                    <Ghost size={32} class="shrink-0 text-base-content/20" strokeWidth={1.5} />
                  </div>
                  <h3 class="mb-2 text-lg font-bold text-base-content/70">
                    {searchQuery() || selectedTag() ? 'Ningun hallazgo' : 'El espacio esta en blanco'}
                  </h3>
                  <p class="mb-6 max-w-[300px] text-[13px] leading-relaxed text-base-content/40">
                    {searchQuery() || selectedTag()
                      ? 'No encontramos coincidencias en el indice ni en los documentos de este espacio.'
                      : 'Crea el primer documento para empezar a construir un indice navegable.'}
                  </p>
                  <button
                    type="button"
                    onClick={createArticle}
                    class="rounded-xl bg-purple-500 px-5 py-2.5 text-[13px] font-bold text-white shadow-lg shadow-purple-500/20 transition-transform active:scale-[0.98]"
                  >
                    Crear documento
                  </button>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      {/* ── Overlay modal for the selected article ── */}
      <Show when={selectedArticle()}>
        {(article) => (
          <WikiArticleDetail
            article={article()}
            onClose={() => { setSelectedArticle(null); refetch(); }}
            onUpdated={(_id, fields) => {
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
            {/* TODO: re-enable hard delete once the silent-failure bug is resolved. */}
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
