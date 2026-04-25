import { createSignal, createEffect, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import type { Story, StoryStatus } from '../types';
import { api, type KanbanResponse } from '../lib/api';
import { useData } from '../lib/data';
import { useAuth } from '../lib/auth';
import { FolderKanban, X, Command } from 'lucide-solid';
import StoryDetail from '../components/StoryDetail';
import TopNavigation from '../components/TopNavigation';
import HeaderSearchBar from '../components/HeaderSearchBar';
import KanbanCard from '../components/kanban/Card';
import Column from '../components/kanban/Column';
import FilterBar from '../components/kanban/FilterBar';
import { useRealtimeRefetch } from '../lib/realtime';
import { activeTab } from '../lib/activeTab';

interface ProjectsPageProps {
  onCreateStory?: (projectId?: string) => void;
  refreshKey?: number;
  onStoryDeleted?: () => void;
}

type DoneRange = 'week' | 'month' | 'all';

const COLUMN_ORDER: StoryStatus[] = ['backlog', 'todo', 'in_progress', 'done'];

const STATUS_LABELS: Record<StoryStatus, string> = {
  backlog: 'Backlog',
  todo: 'Por hacer',
  in_progress: 'En progreso',
  done: 'Hecho',
};

const EMPTY_MESSAGES: Record<StoryStatus, string> = {
  backlog: 'Sin tareas pendientes. El futuro-tú lo agradecerá.',
  todo: 'Todo tranquilo aquí. Agrega una tarea o arrastra desde Backlog.',
  in_progress: 'Nada en vuelo. Empieza moviendo algo desde Por hacer.',
  done: 'Aún sin tareas completadas. Todo a su tiempo.',
};

const FILTERS_STORAGE_KEY = 'kanban_filters_v1';

interface PersistedFilters {
  scope: 'mine' | 'all';
  projects: string[];
  collapsed_columns: StoryStatus[];
  done_range: DoneRange;
}

const ProjectsPage: Component<ProjectsPageProps> = (props) => {
  const data = useData();
  const auth = useAuth();

  // ─── Data state ─────────────────────────────────
  const [buckets, setBuckets] = createSignal<KanbanResponse | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [loadingBucket, setLoadingBucket] = createSignal<StoryStatus | null>(null);

  // ─── Filters (persisted) ────────────────────────
  const [scope, setScope] = createSignal<'mine' | 'all'>('mine');
  const [selectedProjectIds, setSelectedProjectIds] = createSignal<string[]>([]);
  const [collapsedColumns, setCollapsedColumns] = createSignal<StoryStatus[]>([]);
  const [doneRange, setDoneRange] = createSignal<DoneRange>('week');

  // ─── UI state ───────────────────────────────────
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);
  const [dragOverCol, setDragOverCol] = createSignal<StoryStatus | null>(null);
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [focusedColumn, setFocusedColumn] = createSignal<StoryStatus>('todo');
  const [focusedCardIndex, setFocusedCardIndex] = createSignal<number>(-1);
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
  const [toast, setToast] = createSignal<{ message: string; kind: 'error' | 'success' } | null>(null);

  // ─── Filter persistence ─────────────────────────
  let filtersLoaded = false;

  const loadFilters = () => {
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
      if (parsed.scope === 'mine' || parsed.scope === 'all') setScope(parsed.scope);
      if (Array.isArray(parsed.projects)) setSelectedProjectIds(parsed.projects.filter(x => typeof x === 'string'));
      if (Array.isArray(parsed.collapsed_columns)) {
        setCollapsedColumns(parsed.collapsed_columns.filter((s): s is StoryStatus =>
          s === 'backlog' || s === 'todo' || s === 'in_progress' || s === 'done'
        ));
      }
      if (parsed.done_range === 'week' || parsed.done_range === 'month' || parsed.done_range === 'all') {
        setDoneRange(parsed.done_range);
      }
    } catch {
      // ignore
    }
  };

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (!filtersLoaded) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const payload: PersistedFilters = {
        scope: scope(),
        projects: selectedProjectIds(),
        collapsed_columns: collapsedColumns(),
        done_range: doneRange(),
      };
      try {
        localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore quota errors
      }
    }, 300);
  };

  // ─── Toast ──────────────────────────────────────
  const showToast = (message: string, kind: 'error' | 'success' = 'error') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  };

  // Merge helper — preserves story references when id + content match, so
  // Solid's `For` reconciles instead of remounting (no stagger-in replay,
  // no flicker). Only changed stories get new refs.
  // Fields that change on every mutation but don't affect rendered content.
  // Ignored when deciding if a story needs a new ref — avoids remounting cards
  // (which would lose :hover, focus, and animation state).
  const IGNORED_MERGE_KEYS = new Set(['updated_at', 'created_at', 'completed_at']);

  const mergeStories = (prev: Story[] | undefined, next: Story[]): Story[] => {
    if (!prev?.length) return next;
    const byId = new Map(prev.map((s) => [s.id, s]));
    return next.map((n) => {
      const old = byId.get(n.id);
      if (!old) return n;
      const keys = new Set([...Object.keys(old), ...Object.keys(n)]);
      for (const k of keys) {
        if (IGNORED_MERGE_KEYS.has(k)) continue;
        const a = (old as any)[k];
        const b = (n as any)[k];
        if (a === b) continue;
        if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])) continue;
        return n;
      }
      return old;
    });
  };

  const mergeBuckets = (prev: KanbanResponse | null, next: KanbanResponse): KanbanResponse => ({
    backlog: { ...next.backlog, items: mergeStories(prev?.backlog.items, next.backlog.items) },
    todo: { ...next.todo, items: mergeStories(prev?.todo.items, next.todo.items) },
    in_progress: { ...next.in_progress, items: mergeStories(prev?.in_progress.items, next.in_progress.items) },
    done: { ...next.done, items: mergeStories(prev?.done.items, next.done.items) },
  });

  // ─── Load kanban data ───────────────────────────
  // `silent` = no loading spinner; used by realtime/focus refetches so the
  // UI updates transparently without a skeleton flash.
  const loadKanban = async (opts: { silent?: boolean } = {}) => {
    const silent = opts.silent ?? !!buckets();
    if (!silent) setLoading(true);
    try {
      const response = await api.stories.kanban({
        scope: scope(),
        projects: selectedProjectIds(),
        done_range: doneRange(),
      });
      setBuckets((prev) => mergeBuckets(prev, response));
    } catch (err) {
      console.error('Failed to load kanban', err);
      if (!silent) showToast('No se pudo cargar el tablero');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadMore = async (status: StoryStatus) => {
    const b = buckets();
    if (!b) return;
    const bucket = b[status];
    setLoadingBucket(status);

    try {
      const params: Parameters<typeof api.stories.listPaged>[0] = {
        status,
        limit: 10,
        offset: bucket.items.length,
      };
      if (selectedProjectIds().length === 1) {
        params.project_id = selectedProjectIds()[0];
      }
      if (scope() === 'mine') {
        const uid = auth.user()?.id;
        if (uid) params.assignee_id = uid;
      }
      if (status === 'done' && doneRange() !== 'all') {
        const days = doneRange() === 'week' ? 7 : 30;
        params.completed_after = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      }

      const page = await api.stories.listPaged(params);
      const moreItems = page.data ?? [];

      // Client-side filter for multi-project selection (if > 1 projects)
      const filtered = selectedProjectIds().length > 1
        ? moreItems.filter(s => s.project_id && selectedProjectIds().includes(s.project_id))
        : moreItems;

      const current = buckets();
      if (!current) return;
      setBuckets({
        ...current,
        [status]: {
          items: [...current[status].items, ...filtered],
          total: current[status].total,
        },
      });
    } catch (err) {
      console.error('Failed to load more', err);
      showToast('No se pudieron cargar más tareas');
    } finally {
      setLoadingBucket(null);
    }
  };

  // ─── Drag & drop ────────────────────────────────
  const cleanupDrag = () => {
    setDragOverCol(null);
    setDraggingId(null);
  };

  const handleDrop = async (e: DragEvent, targetStatus: StoryStatus) => {
    e.preventDefault();
    const storyId = draggingId() || e.dataTransfer?.getData('text/plain');
    if (!storyId) {
      cleanupDrag();
      return;
    }

    const current = buckets();
    if (!current) { cleanupDrag(); return; }

    let story: Story | null = null;
    let sourceStatus: StoryStatus | null = null;
    for (const s of COLUMN_ORDER) {
      const found = current[s].items.find(x => x.id === storyId);
      if (found) { story = found as Story; sourceStatus = s; break; }
    }
    if (!story || !sourceStatus || sourceStatus === targetStatus) {
      cleanupDrag();
      return;
    }

    // Optimistic update
    const updated: KanbanResponse = {
      ...current,
      [sourceStatus]: {
        items: current[sourceStatus].items.filter(x => x.id !== storyId),
        total: Math.max(0, current[sourceStatus].total - 1),
      },
      [targetStatus]: {
        items: [{ ...(story as any), status: targetStatus }, ...current[targetStatus].items],
        total: current[targetStatus].total + 1,
      },
    } as KanbanResponse;
    setBuckets(updated);
    cleanupDrag();

    try {
      await api.stories.update(storyId, { status: targetStatus });
    } catch (err) {
      // Rollback
      setBuckets(current);
      showToast('No se pudo mover la tarea');
    }
  };

  const handleDragStart = (e: DragEvent, storyId: string) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', storyId);
    }
    setDraggingId(storyId);
  };

  // ─── Column collapse ────────────────────────────
  const toggleCollapse = (status: StoryStatus) => {
    setCollapsedColumns(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  // ─── Quick add ──────────────────────────────────
  const quickAddTask = async (status: StoryStatus, title: string) => {
    if (!title.trim()) return;
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        status,
        priority: 'medium',
      };
      const uid = auth.user()?.id;
      if (uid) payload.assignee_id = uid;
      if (selectedProjectIds().length === 1) {
        payload.project_id = selectedProjectIds()[0];
      }
      const created = await api.stories.create(payload);

      const current = buckets();
      if (current) {
        setBuckets({
          ...current,
          [status]: {
            items: [created, ...current[status].items],
            total: current[status].total + 1,
          },
        });
      }
    } catch (err) {
      console.error('quickAdd failed', err);
      showToast('No se pudo crear la tarea');
      throw err;
    }
  };

  // ─── Project toggle ─────────────────────────────
  const toggleProject = (id: string) => {
    setSelectedProjectIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  // ─── Computed ───────────────────────────────────
  const activeProjects = () => data.projects().filter(p => p.status === 'active');

  // ─── Filtered buckets (search) ──────────────────
  const filteredBuckets = (): KanbanResponse | null => {
    const b = buckets();
    if (!b) return null;
    const q = searchQuery().trim().toLowerCase();
    if (!q) return b;
    const match = (s: Story) =>
      s.title.toLowerCase().includes(q) ||
      (s.code ?? '').toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q);

    const result = {} as KanbanResponse;
    for (const status of COLUMN_ORDER) {
      const items = b[status].items.filter(match);
      result[status] = { items, total: items.length };
    }
    return result;
  };

  // ─── Keyboard shortcuts ─────────────────────────
  const isEditableTarget = (el: EventTarget | null) => {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  };

  const moveFocusedStory = async (targetStatus: StoryStatus) => {
    const b = filteredBuckets();
    if (!b) return;
    const col = focusedColumn();
    const idx = focusedCardIndex();
    const story = b[col].items[idx];
    if (!story || story.status === targetStatus) return;

    // Simulate drop
    setDraggingId(story.id);
    const fakeEvent = { preventDefault: () => {}, dataTransfer: null } as unknown as DragEvent;
    await handleDrop(fakeEvent, targetStatus);
    setFocusedColumn(targetStatus);
    setFocusedCardIndex(0);
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target)) return;

    if (e.key === 'Escape') {
      if (shortcutsOpen()) { setShortcutsOpen(false); return; }
      if (selectedStory()) { setSelectedStory(null); return; }
      setFocusedCardIndex(-1);
      return;
    }

    if (e.key === '?') {
      e.preventDefault();
      setShortcutsOpen(v => !v);
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      window.dispatchEvent(new Event('open-search'));
      return;
    }

    if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      const pid = selectedProjectIds().length === 1 ? selectedProjectIds()[0] : undefined;
      props.onCreateStory?.(pid);
      return;
    }

    const b = filteredBuckets();
    if (!b) return;
    const col = focusedColumn();
    const items = b[col].items;

    if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
      e.preventDefault();
      if (items.length === 0) return;
      setFocusedCardIndex(i => Math.min(items.length - 1, Math.max(0, i) + 1));
      return;
    }
    if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setFocusedCardIndex(i => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'h') {
      e.preventDefault();
      const idx = COLUMN_ORDER.indexOf(col);
      const prev = COLUMN_ORDER[Math.max(0, idx - 1)];
      setFocusedColumn(prev);
      setFocusedCardIndex(0);
      return;
    }
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'l') {
      e.preventDefault();
      const idx = COLUMN_ORDER.indexOf(col);
      const next = COLUMN_ORDER[Math.min(COLUMN_ORDER.length - 1, idx + 1)];
      setFocusedColumn(next);
      setFocusedCardIndex(0);
      return;
    }
    if (e.key === 'Enter') {
      const story = items[focusedCardIndex()];
      if (story) {
        e.preventDefault();
        setSelectedStory(story);
      }
      return;
    }
    if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
      e.preventDefault();
      const target = COLUMN_ORDER[parseInt(e.key, 10) - 1];
      void moveFocusedStory(target);
      return;
    }
  };

  // ─── Lifecycle ──────────────────────────────────
  let unsubRealtime: (() => void) | undefined;
  onMount(() => {
    loadFilters();
    filtersLoaded = true;
    void loadKanban();
    document.addEventListener('keydown', handleKeydown);
    unsubRealtime = useRealtimeRefetch(
      ['story.'],
      () => void loadKanban({ silent: true }),
      { isActive: () => activeTab() === 'projects' },
    );
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeydown);
    if (saveTimer) clearTimeout(saveTimer);
    unsubRealtime?.();
  });

  // Reload on filter change or refreshKey
  createEffect(() => {
    scope();
    selectedProjectIds();
    doneRange();
    props.refreshKey;
    if (filtersLoaded) void loadKanban();
  });

  // Persist filters (debounced)
  createEffect(() => {
    scope();
    selectedProjectIds();
    collapsedColumns();
    doneRange();
    scheduleSave();
  });

  // ─── Render ─────────────────────────────────────
  const renderColumn = (status: StoryStatus) => {
    const b = filteredBuckets();
    const bucket = b?.[status] ?? { items: [], total: 0 };
    const items = bucket.items as Story[];
    const hasMore = items.length < bucket.total;
    const remaining = Math.max(0, bucket.total - items.length);

    return (
      <Column
        status={status}
        label={STATUS_LABELS[status]}
        count={bucket.total}
        stories={items}
        collapsed={collapsedColumns().includes(status)}
        onToggleCollapse={() => toggleCollapse(status)}
        onLoadMore={hasMore ? () => loadMore(status) : undefined}
        hasMore={hasMore}
        remainingCount={remaining}
        onQuickAdd={(title) => quickAddTask(status, title)}
        emptyMessage={EMPTY_MESSAGES[status]}
        doneRange={status === 'done' ? doneRange() : undefined}
        onDoneRangeChange={status === 'done' ? (r) => setDoneRange(r) : undefined}
        onDragOver={(e) => { e.preventDefault(); setDragOverCol(status); }}
        onDragLeave={() => setDragOverCol(null)}
        onDrop={(e) => handleDrop(e, status)}
        isDragOver={dragOverCol() === status}
        renderCard={(story) => {
          const idx = items.findIndex(s => s.id === story.id);
          const isFocused = focusedColumn() === status && focusedCardIndex() === idx;
          const project = story.project_id ? data.getProjectById(story.project_id) ?? null : null;
          const assignee = story.assignee_id ? data.getUserById(story.assignee_id) ?? null : null;
          const ownerId = assignee?.id ?? story.assignee_id;
          const otherAssignees = ((story as any).assignees as string[] | undefined ?? [])
            .filter((id) => id !== ownerId)
            .map((id) => data.getUserById(id))
            .filter((u): u is NonNullable<typeof u> => !!u);
          return (
            <KanbanCard
              story={story}
              project={project}
              assignee={assignee}
              otherAssignees={otherAssignees}
              selected={isFocused}
              showAvatar={true}
              onClick={() => {
                setFocusedColumn(status);
                setFocusedCardIndex(idx);
                setSelectedStory(story);
              }}
              onDragStart={(e) => handleDragStart(e, story.id)}
              onDragEnd={cleanupDrag}
              dragging={draggingId() === story.id}
            />
          );
        }}
      />
    );
  };

  return (
    <div class="space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <TopNavigation
        breadcrumbs={[
          { label: 'Proyectos', icon: <FolderKanban size={14} /> },
        ]}
        center={
          <HeaderSearchBar
            value={searchQuery()}
            onInput={setSearchQuery}
            placeholder="Buscar tareas..."
          />
        }
      />

      {/* Filter bar */}
      <div class="px-1">
        <FilterBar
          scope={scope()}
          onScopeChange={setScope}
          allProjects={activeProjects()}
          selectedProjectIds={selectedProjectIds()}
          onToggleProject={toggleProject}
          onClearProjects={() => setSelectedProjectIds([])}
        />
      </div>

      {/* Kanban grid */}
      <Show when={!loading() || buckets()} fallback={<KanbanSkeleton />}>
        <div class="grid grid-cols-4 gap-3 items-start pb-4">
          <For each={COLUMN_ORDER}>
            {(status) => (
              <div class="min-w-0 flex">
                {renderColumn(status)}
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Story Detail Modal */}
      <Show when={selectedStory()}>
        {(s) => (
          <StoryDetail
            story={s()}
            onClose={() => setSelectedStory(null)}
            onDeleted={() => {
              setSelectedStory(null);
              void loadKanban();
              props.onStoryDeleted?.();
            }}
            onUpdated={(id, fields) => {
              const current = buckets();
              if (!current) return;
              const updated = { ...current } as KanbanResponse;
              for (const status of COLUMN_ORDER) {
                updated[status] = {
                  ...current[status],
                  items: current[status].items.map(item =>
                    item.id === id ? { ...item, ...fields } as any : item
                  ),
                };
              }
              setBuckets(updated);
              // If status changed, reload to get counts right
              if (fields.status && fields.status !== s().status) {
                void loadKanban();
              }
              if (fields.is_active === false) {
                void loadKanban();
              }
            }}
          />
        )}
      </Show>

      {/* Shortcuts overlay */}
      <Show when={shortcutsOpen()}>
        <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />
      </Show>

      {/* Toast */}
      <Show when={toast()}>
        {(t) => (
          <div
            class={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-[13px] font-medium ${
              t().kind === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-ios-green-500 text-white'
            }`}
          >
            {t().message}
          </div>
        )}
      </Show>
    </div>
  );
};

// ─── Shortcuts overlay ────────────────────────────
const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['?'], label: 'Mostrar / ocultar atajos' },
  { keys: ['/'], label: 'Abrir búsqueda' },
  { keys: ['N'], label: 'Nueva tarea' },
  { keys: ['J', '↓'], label: 'Siguiente tarjeta' },
  { keys: ['K', '↑'], label: 'Tarjeta anterior' },
  { keys: ['H', '←'], label: 'Columna anterior' },
  { keys: ['L', '→'], label: 'Columna siguiente' },
  { keys: ['Enter'], label: 'Abrir tarea' },
  { keys: ['1'], label: 'Mover a Backlog' },
  { keys: ['2'], label: 'Mover a Por hacer' },
  { keys: ['3'], label: 'Mover a En progreso' },
  { keys: ['4'], label: 'Mover a Hecho' },
  { keys: ['Esc'], label: 'Cerrar / limpiar foco' },
];

const ShortcutsOverlay: Component<{ onClose: () => void }> = (props) => {
  const handleBackdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) props.onClose();
  };
  return (
    <div
      class="fixed inset-0 bg-base-content/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdrop}
    >
      <div class="bg-base-100 rounded-2xl shadow-xl max-w-lg w-full border border-base-content/[0.08] overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <div class="flex items-center gap-2">
            <Command size={16} class="text-base-content/60" />
            <h2 class="text-[15px] font-semibold text-base-content">Atajos de teclado</h2>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 hover:text-base-content transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
        <div class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          <For each={SHORTCUTS}>
            {(sc) => (
              <div class="flex items-center justify-between gap-3 min-w-0">
                <span class="text-[13px] text-base-content/70 truncate">{sc.label}</span>
                <div class="flex items-center gap-1 shrink-0">
                  <For each={sc.keys}>
                    {(key) => (
                      <kbd class="inline-flex items-center justify-center min-w-[22px] h-6 px-1.5 rounded-md bg-base-200 border border-base-content/[0.08] text-[11px] font-mono font-semibold text-base-content/70">
                        {key}
                      </kbd>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

// ─── Skeleton ─────────────────────────────────────
const KanbanSkeleton: Component = () => (
  <div class="grid grid-cols-4 gap-3 items-start">
    {[0, 1, 2, 3].map(() => (
      <div class="min-w-0 flex flex-col gap-2 rounded-2xl bg-base-200/30 border border-base-content/[0.05] p-3 min-h-[400px]">
        <div class="h-4 w-24 rounded-md bg-base-content/5" />
        <div class="h-24 rounded-xl bg-base-100/50 border border-base-content/[0.03]" />
        <div class="h-24 rounded-xl bg-base-100/50 border border-base-content/[0.03]" />
        <div class="h-24 rounded-xl bg-base-100/50 border border-base-content/[0.03]" />
      </div>
    ))}
  </div>
);

export default ProjectsPage;
