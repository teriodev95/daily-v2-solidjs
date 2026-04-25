import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import { CheckCircle2, Circle, Clipboard, Command, ExternalLink, EyeOff, FolderKanban, Inbox, PlayCircle, Trash2, X } from 'lucide-solid';
import type { Story, StoryStatus } from '../../types';
import { api, type KanbanResponse } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { onRealtime, onRealtimeStatus, type RealtimeEvent } from '../../lib/realtime';
import HeaderSearchBar from '../HeaderSearchBar';
import StoryDetail from '../StoryDetail';
import TopNavigation from '../TopNavigation';
import FilterBar from '../kanban/FilterBar';
import KanbanCard from './KanbanCard';
import KanbanColumn from './KanbanColumn';
import {
  COLUMN_ORDER,
  STATUS_LABELS,
  deleteStory,
  insertStory,
  mergeBuckets,
  moveStory,
  updateStory,
  visibleBuckets,
  type DoneRange,
} from './kanbanState';

interface KanbanBoardProps {
  refreshKey?: number;
  onStoryDeleted?: () => void;
}

type Scope = 'mine' | 'all';

interface PersistedFilters {
  scope: Scope;
  projects: string[];
  done_range: DoneRange;
}

interface DropTarget {
  status: StoryStatus;
  beforeId: string | null;
  afterId: string | null;
}

interface PointerDragState {
  story: Story;
  fromStatus: StoryStatus;
  fromIndex: number;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  started: boolean;
}

interface CardMenuState {
  story: Story;
  x: number;
  y: number;
}

const FILTERS_STORAGE_KEY = 'kanban_v2_filters_v1';
const DRAG_THRESHOLD = 6;

const isStory = (value: unknown): value is Story =>
  !!value && typeof value === 'object' && typeof (value as any).id === 'string' && typeof (value as any).status === 'string';

const KanbanBoard: Component<KanbanBoardProps> = (props) => {
  const data = useData();
  const auth = useAuth();

  const [buckets, setBuckets] = createSignal<KanbanResponse | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [scope, setScope] = createSignal<Scope>('mine');
  const [selectedProjectIds, setSelectedProjectIds] = createSignal<string[]>([]);
  const [doneRange, setDoneRange] = createSignal<DoneRange>('week');
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);
  const [activeDrag, setActiveDrag] = createSignal<PointerDragState | null>(null);
  const [dropTarget, setDropTarget] = createSignal<DropTarget | null>(null);
  const [suppressCardClick, setSuppressCardClick] = createSignal(false);
  const [cardMenu, setCardMenu] = createSignal<CardMenuState | null>(null);
  const [menuBusy, setMenuBusy] = createSignal<string | null>(null);
  const [confirmingMenuDelete, setConfirmingMenuDelete] = createSignal(false);
  const [focusedColumn, setFocusedColumn] = createSignal<StoryStatus>('todo');
  const [focusedIndex, setFocusedIndex] = createSignal(0);
  const [quickAddTokens, setQuickAddTokens] = createSignal<Record<StoryStatus, number>>({
    backlog: 0,
    todo: 0,
    in_progress: 0,
    done: 0,
  });
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
  const [toast, setToast] = createSignal<{ message: string; kind: 'error' | 'success' } | null>(null);

  let filtersLoaded = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let clickSuppressTimer: ReturnType<typeof setTimeout> | undefined;
  let previousUserSelect = '';
  let previousCursor = '';

  const visible = createMemo(() => visibleBuckets(buckets(), searchQuery()));
  const draggingId = () => activeDrag()?.started ? activeDrag()!.story.id : null;
  const activeProjects = () => data.projects().filter((project) => project.status === 'active');

  const showToast = (message: string, kind: 'error' | 'success' = 'error') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 2800);
  };

  const copyText = async (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const loadFilters = () => {
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
      if (parsed.scope === 'mine' || parsed.scope === 'all') setScope(parsed.scope);
      if (Array.isArray(parsed.projects)) setSelectedProjectIds(parsed.projects.filter((id) => typeof id === 'string'));
      if (parsed.done_range === 'week' || parsed.done_range === 'month' || parsed.done_range === 'all') setDoneRange(parsed.done_range);
    } catch {
      // Ignore corrupt local preferences.
    }
  };

  const scheduleSaveFilters = () => {
    if (!filtersLoaded) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const payload: PersistedFilters = {
        scope: scope(),
        projects: selectedProjectIds(),
        done_range: doneRange(),
      };
      try { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload)); } catch { /* ignore quota */ }
    }, 250);
  };

  const loadKanban = async (opts: { silent?: boolean } = {}) => {
    const silent = opts.silent ?? !!buckets();
    if (!silent) setLoading(true);
    try {
      const next = await api.stories.kanban({
        scope: scope(),
        projects: selectedProjectIds(),
        done_range: doneRange(),
      });
      setBuckets((prev) => mergeBuckets(prev, next));
    } catch (err) {
      console.error('kanban load failed', err);
      if (!silent) showToast('No se pudo cargar el tablero');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const matchesCurrentFilters = (story: Story) => {
    if (!story.is_active) return false;
    const projects = selectedProjectIds();
    if (projects.length > 0 && (!story.project_id || !projects.includes(story.project_id))) return false;
    if (scope() === 'mine') {
      const uid = auth.user()?.id;
      if (!uid) return false;
      const mine = story.assignee_id === uid || story.created_by === uid || ((story as any).assignees as string[] | undefined)?.includes(uid);
      if (!mine) return false;
    }
    if (story.status === 'done' && doneRange() !== 'all') {
      if (!story.completed_at) return false;
      const days = doneRange() === 'week' ? 7 : 30;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      if (Date.parse(story.completed_at) < cutoff) return false;
    }
    return true;
  };

  const applyRealtimeStory = (story: Story, beforeId: string | null = null, afterId: string | null = null) => {
    setBuckets((current) => {
      if (!current) return current;
      if (!matchesCurrentFilters(story)) return deleteStory(current, story.id);
      return beforeId !== null || afterId !== null
        ? insertStory(current, story, beforeId, afterId)
        : updateStory(current, story, matchesCurrentFilters);
    });
    setSelectedStory((current) => current?.id === story.id ? { ...current, ...story } : current);
  };

  const handleRealtime = (event: RealtimeEvent) => {
    if (!event.type.startsWith('story.')) return;
    if (event.type === 'story.deleted') {
      const id = event.id as string | undefined;
      if (!id) return void loadKanban({ silent: true });
      setBuckets((current) => current ? deleteStory(current, id) : current);
      setSelectedStory((current) => current?.id === id ? null : current);
      return;
    }

    const story = event.story;
    if (!isStory(story)) {
      void loadKanban({ silent: true });
      return;
    }

    if (event.type === 'story.moved') {
      applyRealtimeStory(story, (event.before_id as string | null | undefined) ?? null, (event.after_id as string | null | undefined) ?? null);
      return;
    }

    applyRealtimeStory(story);
  };

  const toggleProject = (id: string) => {
    setSelectedProjectIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  };

  const quickAdd = async (title: string, status: StoryStatus) => {
    const payload: Record<string, unknown> = {
      title,
      status,
      priority: 'medium',
    };
    const uid = auth.user()?.id;
    if (uid) payload.assignee_id = uid;
    if (selectedProjectIds().length === 1) payload.project_id = selectedProjectIds()[0];

    const created = await api.stories.create(payload);
    setBuckets((current) => current ? insertStory(current, created as Story) : current);
  };

  const openCardMenu = (event: MouseEvent, story: Story) => {
    const menuW = 220;
    const menuH = 290;
    setCardMenu({
      story,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuW - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuH - 8)),
    });
    setConfirmingMenuDelete(false);
  };

  const openStory = (story: Story) => {
    const current = visible();
    const status = current ? COLUMN_ORDER.find((item) => (current[item].items as Story[]).some((s) => s.id === story.id)) : null;
    if (status) {
      const index = ((current?.[status].items ?? []) as Story[]).findIndex((item) => item.id === story.id);
      setFocusedColumn(status);
      setFocusedIndex(Math.max(0, index));
    }
    setSelectedStory(story);
    setCardMenu(null);
  };

  const focusStoryById = (source: KanbanResponse | null, storyId: string) => {
    if (!source) return false;
    for (const status of COLUMN_ORDER) {
      const index = (source[status].items as Story[]).findIndex((story) => story.id === storyId);
      if (index >= 0) {
        setFocusedColumn(status);
        setFocusedIndex(index);
        return true;
      }
    }
    return false;
  };

  const moveStoryFromMenu = async (story: Story, status: StoryStatus) => {
    if (story.status === status || menuBusy()) return;
    const current = buckets();
    if (!current) return;
    const snapshot = current;
    setMenuBusy(`move-${status}`);
    const moved = moveStory(current, story.id, status, null, null);
    if (moved.story) setBuckets(moved.next);
    try {
      const updated = await api.stories.move(story.id, {
        to_status: status,
        before_id: null,
        after_id: null,
      });
      applyRealtimeStory(updated as Story);
      setCardMenu(null);
    } catch (err) {
      console.error('menu move failed', err);
      setBuckets(snapshot);
      showToast('No se pudo mover la historia');
    } finally {
      setMenuBusy(null);
    }
  };

  const hideStoryFromMenu = async (story: Story) => {
    if (menuBusy()) return;
    const current = buckets();
    if (!current) return;
    setMenuBusy('hide');
    setBuckets(deleteStory(current, story.id));
    try {
      await api.stories.update(story.id, { is_active: false });
      setSelectedStory((item) => item?.id === story.id ? null : item);
      setCardMenu(null);
      setConfirmingMenuDelete(false);
      showToast('Historia ocultada', 'success');
    } catch (err) {
      console.error('hide story failed', err);
      setBuckets(current);
      showToast('No se pudo ocultar la historia');
    } finally {
      setMenuBusy(null);
    }
  };

  const copyStoryLinkFromMenu = async (story: Story) => {
    if (menuBusy()) return;
    setMenuBusy('copy');
    try {
      const response = await api.stories.createShareToken(story.id);
      await copyText(response.share_url);
      setCardMenu(null);
      showToast('Enlace copiado', 'success');
    } catch (err) {
      console.error('copy story link failed', err);
      showToast('No se pudo copiar el enlace');
    } finally {
      setMenuBusy(null);
    }
  };

  const deleteStoryFromMenu = async (story: Story) => {
    if (menuBusy()) return;
    setMenuBusy('delete');
    try {
      await api.stories.delete(story.id);
      setBuckets((current) => current ? deleteStory(current, story.id) : current);
      setSelectedStory((item) => item?.id === story.id ? null : item);
      setCardMenu(null);
      setConfirmingMenuDelete(false);
      showToast('Historia eliminada', 'success');
    } catch (err) {
      console.error('delete story failed', err);
      showToast('No se pudo eliminar la historia');
    } finally {
      setMenuBusy(null);
    }
  };

  const setDocumentDragMode = (enabled: boolean) => {
    if (enabled) {
      previousUserSelect = document.body.style.userSelect;
      previousCursor = document.body.style.cursor;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      return;
    }
    document.body.style.userSelect = previousUserSelect;
    document.body.style.cursor = previousCursor;
  };

  const suppressNextClick = () => {
    setSuppressCardClick(true);
    clearTimeout(clickSuppressTimer);
    clickSuppressTimer = setTimeout(() => setSuppressCardClick(false), 220);
  };

  const cleanupDrag = () => {
    window.removeEventListener('pointermove', handlePointerMove, true);
    window.removeEventListener('pointerup', handlePointerUp, true);
    window.removeEventListener('pointercancel', handlePointerCancel, true);
    setDocumentDragMode(false);
    setActiveDrag(null);
    setDropTarget(null);
  };

  const setDragPosition = (status: StoryStatus, beforeId: string | null, afterId: string | null) => {
    if (!draggingId()) return;
    const current = dropTarget();
    if (current?.status === status && current.beforeId === beforeId && current.afterId === afterId) return;
    setDropTarget({ status, beforeId, afterId });
  };

  const findDropTarget = (x: number, y: number): DropTarget | null => {
    const element = document.elementFromPoint(x, y);
    const column = element?.closest<HTMLElement>('[data-kanban-column-status]');
    const status = column?.dataset.kanbanColumnStatus as StoryStatus | undefined;
    if (!column || !status || !COLUMN_ORDER.includes(status)) return null;

    const cards = Array.from(column.querySelectorAll<HTMLElement>('[data-kanban-card-id]'))
      .filter((el) => el.dataset.kanbanCardId !== activeDrag()?.story.id);
    if (cards.length === 0) return { status, beforeId: null, afterId: null };

    let beforeId: string | null = null;
    let afterId: string | null = null;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (y < midpoint) {
        beforeId = card.dataset.kanbanCardId ?? null;
        break;
      }
      afterId = card.dataset.kanbanCardId ?? null;
    }
    return {
      status,
      beforeId,
      afterId: beforeId ? afterId : (cards.at(-1)?.dataset.kanbanCardId ?? null),
    };
  };

  const handlePointerMove = (event: PointerEvent) => {
    const drag = activeDrag();
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const distance = Math.hypot(dx, dy);
    const shouldStart = drag.started || distance >= DRAG_THRESHOLD;

    if (!shouldStart) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.started) {
      setDocumentDragMode(true);
      setFocusedColumn(drag.fromStatus);
      setFocusedIndex(drag.fromIndex);
    }

    setActiveDrag((current) => current && current.pointerId === event.pointerId
      ? { ...current, x: event.clientX, y: event.clientY, started: true }
      : current);

    const target = findDropTarget(event.clientX, event.clientY);
    if (target) setDragPosition(target.status, target.beforeId, target.afterId);
  };

  const handlePointerCancel = (event: PointerEvent) => {
    const drag = activeDrag();
    if (!drag || event.pointerId !== drag.pointerId) return;
    cleanupDrag();
  };

  const dropStory = async (status: StoryStatus, beforeId: string | null, afterId: string | null) => {
    const storyId = draggingId();
    const current = buckets();
    if (!storyId || !current) {
      cleanupDrag();
      return;
    }
    const snapshot = current;
    const moved = moveStory(current, storyId, status, beforeId, afterId);
    if (!moved.story) {
      cleanupDrag();
      return;
    }
    setBuckets(moved.next);
    focusStoryById(moved.next, storyId);
    cleanupDrag();
    try {
      const updated = await api.stories.move(storyId, {
        to_status: status,
        before_id: beforeId,
        after_id: afterId,
      });
      applyRealtimeStory(updated as Story, beforeId, afterId);
      queueMicrotask(() => focusStoryById(buckets(), storyId));
    } catch (err) {
      console.error('move failed', err);
      setBuckets(snapshot);
      focusStoryById(snapshot, storyId);
      showToast('No se pudo mover la tarea');
    }
  };

  const handlePointerUp = (event: PointerEvent) => {
    const drag = activeDrag();
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopPropagation();

    if (!drag.started) {
      cleanupDrag();
      setFocusedColumn(drag.fromStatus);
      setFocusedIndex(drag.fromIndex);
      setSelectedStory(drag.story);
      return;
    }

    event.preventDefault();
    suppressNextClick();
    const target = dropTarget();
    if (!target) {
      cleanupDrag();
      return;
    }
    void dropStory(target.status, target.beforeId, target.afterId);
  };

  const beginPointerIntent = (
    event: PointerEvent,
    story: Story,
    element: HTMLElement,
    fromStatus: StoryStatus,
    fromIndex: number,
  ) => {
    const rect = element.getBoundingClientRect();
    setActiveDrag({
      story,
      fromStatus,
      fromIndex,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      started: false,
    });
    setDropTarget(null);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
  };

  const focusColumnItems = () => {
    const b = visible();
    return b?.[focusedColumn()].items as Story[] | undefined;
  };

  const openFocusedStory = () => {
    const items = focusColumnItems();
    const story = items?.[focusedIndex()];
    if (story) setSelectedStory(story);
  };

  const bumpQuickAdd = (status: StoryStatus) => {
    setQuickAddTokens((current) => ({ ...current, [status]: current[status] + 1 }));
  };

  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return;
    if (event.key === 'Escape') {
      if (activeDrag()) {
        event.preventDefault();
        cleanupDrag();
        return;
      }
      if (cardMenu()) {
        setCardMenu(null);
        setConfirmingMenuDelete(false);
        return;
      }
      if (shortcutsOpen()) return setShortcutsOpen(false);
      if (selectedStory()) return setSelectedStory(null);
      setFocusedIndex(0);
      return;
    }
    if (event.key === '?') {
      event.preventDefault();
      setShortcutsOpen((open) => !open);
      return;
    }
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      bumpQuickAdd(focusedColumn());
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      openFocusedStory();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const items = focusColumnItems() ?? [];
      setFocusedIndex((index) => Math.min(Math.max(items.length - 1, 0), index + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const current = COLUMN_ORDER.indexOf(focusedColumn());
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      const next = COLUMN_ORDER[Math.max(0, Math.min(COLUMN_ORDER.length - 1, current + delta))];
      setFocusedColumn(next);
      setFocusedIndex(0);
    }
  };

  onMount(() => {
    loadFilters();
    filtersLoaded = true;
    void loadKanban();
    document.addEventListener('keydown', handleKeydown);
    const unsubRealtime = onRealtime(handleRealtime);
    const unsubStatus = onRealtimeStatus((online) => {
      if (online) void loadKanban({ silent: true });
    });
    const onFocus = () => void loadKanban({ silent: true });
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('[data-kanban-card-menu]')) return;
        setCardMenu(null);
        setConfirmingMenuDelete(false);
      };
    window.addEventListener('focus', onFocus);
    document.addEventListener('pointerdown', onPointerDown);
    onCleanup(() => {
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('pointerdown', onPointerDown);
      unsubRealtime();
      unsubStatus();
    });
  });

  onCleanup(() => {
    clearTimeout(saveTimer);
    clearTimeout(clickSuppressTimer);
    cleanupDrag();
  });

  createEffect(() => {
    scope();
    selectedProjectIds();
    doneRange();
    props.refreshKey;
    if (filtersLoaded) void loadKanban({ silent: true });
  });

  createEffect(() => {
    scope();
    selectedProjectIds();
    doneRange();
    scheduleSaveFilters();
  });

  const renderColumn = (status: StoryStatus) => {
    const b = visible();
    const bucket = b?.[status] ?? { items: [], total: 0 };
    const items = bucket.items as Story[];
    const target = dropTarget();

    return (
      <KanbanColumn
        status={status}
        label={STATUS_LABELS[status]}
        count={bucket.total}
        stories={items}
        focused={focusedColumn() === status}
        quickAddToken={quickAddTokens()[status]}
        draggingId={draggingId()}
        placeholderHeight={activeDrag()?.height ?? null}
        dropBeforeId={target?.status === status ? target.beforeId : null}
        dropAfterId={target?.status === status ? target.afterId : null}
        doneRange={status === 'done' ? doneRange() : undefined}
        onDoneRangeChange={status === 'done' ? setDoneRange : undefined}
        onQuickAdd={quickAdd}
        renderCard={(story) => {
          const index = items.findIndex((item) => item.id === story.id);
          const project = story.project_id ? data.getProjectById(story.project_id) ?? null : null;
          const assignee = story.assignee_id ? data.getUserById(story.assignee_id) ?? null : null;
          const ownerId = assignee?.id ?? story.assignee_id;
          const others = ((story as any).assignees as string[] | undefined ?? [])
            .filter((id) => id !== ownerId)
            .map((id) => data.getUserById(id))
            .filter((user): user is NonNullable<typeof user> => !!user);
          return (
            <KanbanCard
              story={story}
              project={project}
              assignee={assignee}
              otherAssignees={others}
              focused={focusedColumn() === status && focusedIndex() === index}
              dragging={draggingId() === story.id}
              suppressClick={suppressCardClick()}
              onOpen={() => {
                setFocusedColumn(status);
                setFocusedIndex(Math.max(0, index));
                setSelectedStory(story);
              }}
              onMenuOpen={openCardMenu}
              onPointerDownCard={(event, item, element) => beginPointerIntent(event, item, element, status, Math.max(0, index))}
            />
          );
        }}
      />
    );
  };

  return (
    <div class="space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <TopNavigation
        breadcrumbs={[{ label: 'Proyectos', icon: <FolderKanban size={14} /> }]}
        center={
          <HeaderSearchBar
            value={searchQuery()}
            onInput={setSearchQuery}
            placeholder="Buscar tareas..."
          />
        }
      />

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

      <Show when={!loading() || buckets()} fallback={<KanbanSkeleton />}>
        <div class="grid grid-cols-4 items-start gap-3 pb-4">
          <For each={COLUMN_ORDER}>
            {(status) => (
              <div class="min-w-0">{renderColumn(status)}</div>
            )}
          </For>
        </div>
      </Show>

      <Show when={activeDrag()?.started}>
        <DragGhost drag={activeDrag()!} />
      </Show>

      <Show when={cardMenu()}>
        {(menu) => (
          <CardContextMenu
            story={menu().story}
            x={menu().x}
            y={menu().y}
            busy={menuBusy()}
            onOpen={() => openStory(menu().story)}
            onCopyLink={() => void copyStoryLinkFromMenu(menu().story)}
            onMove={(status) => void moveStoryFromMenu(menu().story, status)}
            onHide={() => void hideStoryFromMenu(menu().story)}
            confirmingDelete={confirmingMenuDelete()}
            onRequestDelete={() => setConfirmingMenuDelete(true)}
            onCancelDelete={() => setConfirmingMenuDelete(false)}
            onConfirmDelete={() => void deleteStoryFromMenu(menu().story)}
          />
        )}
      </Show>

      <Show when={selectedStory()}>
        {(story) => (
          <StoryDetail
            story={story()}
            onClose={() => setSelectedStory(null)}
            onDeleted={() => {
              setSelectedStory(null);
              setBuckets((current) => current ? deleteStory(current, story().id) : current);
              props.onStoryDeleted?.();
            }}
            onUpdated={(id, fields) => {
              setBuckets((current) => {
                if (!current) return current;
                const currentStory = story();
                const nextStory = { ...currentStory, ...fields } as Story;
                return updateStory(current, nextStory, matchesCurrentFilters);
              });
            }}
          />
        )}
      </Show>

      <Show when={shortcutsOpen()}>
        <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />
      </Show>

      <Show when={toast()}>
        {(item) => (
          <div
            class={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-[13px] font-medium text-white shadow-lg ${
              item().kind === 'error' ? 'bg-red-500' : 'bg-ios-green-500'
            }`}
          >
            {item().message}
          </div>
        )}
      </Show>
    </div>
  );
};

const DragGhost: Component<{ drag: PointerDragState }> = (props) => (
  <div
    class="pointer-events-none fixed z-[120] overflow-hidden rounded-xl border border-base-content/[0.12] bg-base-100/95 px-3 py-2.5 opacity-95 shadow-[0_12px_30px_rgba(31,35,41,0.18)]"
    style={{
      left: `${props.drag.x - props.drag.offsetX}px`,
      top: `${props.drag.y - props.drag.offsetY}px`,
      width: `${props.drag.width}px`,
      height: `${props.drag.height}px`,
    }}
  >
    <div class="mb-2 flex min-h-5 items-center justify-between gap-2">
      <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-base-content/18" aria-hidden="true" />
      <span class="rounded-full bg-base-content/[0.05] px-2 py-0.5 text-[10.5px] font-medium leading-none text-base-content/45">
        Moviendo
      </span>
    </div>
    <h3 class="line-clamp-2 break-words text-[13px] font-semibold leading-[1.34] text-base-content/88">
      {props.drag.story.title}
    </h3>
  </div>
);

const MENU_STATUS_ICONS: Record<StoryStatus, Component<{ size?: number }>> = {
  backlog: Inbox,
  todo: Circle,
  in_progress: PlayCircle,
  done: CheckCircle2,
};

const CardContextMenu: Component<{
  story: Story;
  x: number;
  y: number;
  busy: string | null;
  onOpen: () => void;
  onCopyLink: () => void;
  onMove: (status: StoryStatus) => void;
  onHide: () => void;
  confirmingDelete: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}> = (props) => (
  <div
    data-kanban-card-menu
    role="menu"
    class="fixed z-[130] w-[220px] overflow-hidden rounded-2xl border border-base-content/[0.08] bg-base-100 py-1.5 shadow-xl shadow-black/20"
    style={{ left: `${props.x}px`, top: `${props.y}px` }}
  >
    <div class="border-b border-base-content/[0.06] px-3 py-2">
      <p class="truncate text-[12px] font-semibold text-base-content/78">{props.story.title}</p>
      <p class="mt-0.5 text-[10.5px] font-medium text-base-content/35">Historia de usuario</p>
    </div>

    <button
      type="button"
      role="menuitem"
      onClick={props.onOpen}
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-base-content/72 transition-colors hover:bg-base-content/[0.045] hover:text-base-content"
    >
      <ExternalLink size={14} />
      Abrir detalle
    </button>

    <button
      type="button"
      role="menuitem"
      disabled={props.busy === 'copy'}
      onClick={props.onCopyLink}
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-base-content/72 transition-colors hover:bg-base-content/[0.045] hover:text-base-content disabled:opacity-50"
    >
      <Clipboard size={14} />
      {props.busy === 'copy' ? 'Copiando...' : 'Copiar enlace'}
    </button>

    <div class="my-1 border-t border-base-content/[0.06]" />
    <div class="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-base-content/28">
      Mover a
    </div>
    <For each={COLUMN_ORDER}>
      {(status) => {
        const Icon = MENU_STATUS_ICONS[status];
        return (
          <button
            type="button"
            role="menuitemradio"
            aria-checked={props.story.status === status}
            disabled={props.story.status === status || props.busy === `move-${status}`}
            onClick={() => props.onMove(status)}
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] font-medium text-base-content/68 transition-colors hover:bg-base-content/[0.045] hover:text-base-content disabled:opacity-45"
          >
            <span class="flex items-center gap-2">
              <Icon size={13} />
              {STATUS_LABELS[status]}
            </span>
            <Show when={props.story.status === status}>
              <span class="h-1.5 w-1.5 rounded-full bg-ios-blue-500" />
            </Show>
          </button>
        );
      }}
    </For>

    <div class="my-1 border-t border-base-content/[0.06]" />
    <button
      type="button"
      role="menuitem"
      disabled={props.busy === 'hide'}
      onClick={props.onHide}
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-base-content/52 transition-colors hover:bg-red-500/[0.07] hover:text-red-500 disabled:opacity-50"
    >
      <EyeOff size={14} />
      {props.busy === 'hide' ? 'Ocultando...' : 'Ocultar'}
    </button>

    <div class="my-1 border-t border-base-content/[0.06]" />
    <Show
      when={props.confirmingDelete}
      fallback={
        <button
          type="button"
          role="menuitem"
          disabled={props.busy === 'delete'}
          onClick={props.onRequestDelete}
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-red-500/78 transition-colors hover:bg-red-500/[0.08] hover:text-red-500 disabled:opacity-50"
        >
          <Trash2 size={14} />
          Eliminar
        </button>
      }
    >
      <div class="px-3 py-2">
        <p class="text-[12px] font-semibold text-red-500">¿Eliminar esta HU?</p>
        <p class="mt-1 text-[11px] leading-snug text-base-content/42">Esta acción borra la historia y sus datos asociados.</p>
        <div class="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={props.busy === 'delete'}
            onClick={props.onCancelDelete}
            class="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-base-content/48 transition-colors hover:bg-base-content/[0.055] hover:text-base-content/75 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={props.busy === 'delete'}
            onClick={props.onConfirmDelete}
            class="rounded-lg bg-red-500/12 px-2.5 py-1.5 text-[11.5px] font-semibold text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50"
          >
            {props.busy === 'delete' ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </Show>
  </div>
);

const ShortcutsOverlay: Component<{ onClose: () => void }> = (props) => (
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-base-content/30 p-4 backdrop-blur-sm"
    onClick={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}
  >
    <div class="w-full max-w-md overflow-hidden rounded-2xl border border-base-content/[0.08] bg-base-100 shadow-xl">
      <div class="flex items-center justify-between border-b border-base-content/[0.06] px-5 py-4">
        <div class="flex items-center gap-2">
          <Command size={16} class="text-base-content/60" />
          <h2 class="text-[15px] font-semibold text-base-content">Atajos</h2>
        </div>
        <button type="button" onClick={props.onClose} class="rounded-lg p-1.5 text-base-content/40 hover:bg-base-content/5 hover:text-base-content">
          <X size={16} />
        </button>
      </div>
      <div class="grid gap-2 p-5 text-[13px] text-base-content/70">
        <p><kbd class="rounded bg-base-200 px-1.5 py-0.5 font-mono text-[11px]">N</kbd> agregar en columna enfocada</p>
        <p><kbd class="rounded bg-base-200 px-1.5 py-0.5 font-mono text-[11px]">Enter</kbd> abrir tarjeta</p>
        <p><kbd class="rounded bg-base-200 px-1.5 py-0.5 font-mono text-[11px]">Esc</kbd> cerrar o limpiar foco</p>
        <p>Flechas para navegar entre tarjetas y columnas.</p>
      </div>
    </div>
  </div>
);

const KanbanSkeleton: Component = () => (
  <div class="grid grid-cols-4 gap-2.5">
    {[0, 1, 2, 3].map(() => (
      <div class="min-h-[460px] rounded-md px-2">
        <div class="mb-3 h-4 w-28 rounded bg-base-content/[0.06]" />
        <div class="space-y-2">
          <div class="h-28 rounded-md border border-base-content/[0.06] bg-base-100" />
          <div class="h-24 rounded-md border border-base-content/[0.06] bg-base-100" />
          <div class="h-28 rounded-md border border-base-content/[0.06] bg-base-100" />
        </div>
      </div>
    ))}
  </div>
);

export default KanbanBoard;
