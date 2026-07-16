import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import { FolderKanban } from 'lucide-solid';
import type { Project, Story, StoryStatus } from '../../types';
import { api, type KanbanBucket, type KanbanResponse } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { onRealtime, onRealtimeStatus, type RealtimeEvent } from '../../lib/realtime';
import HeaderSearchBar from '../HeaderSearchBar';
import StoryDetail from '../StoryDetail';
import TopNavigation from '../TopNavigation';
import FilterBar from './FilterBar';
import KanbanCard from './KanbanCard';
import KanbanColumn from './KanbanColumn';
import CardContextMenu from './CardContextMenu';
import DoneStoriesModal, { DoneMetric } from './DoneStoriesModal';
import DragGhost from './DragGhost';
import ShortcutsOverlay from './ShortcutsOverlay';
import { createKanbanDrag, type DropTarget } from './createKanbanDrag';
import { playInteractionSuccess } from '../../lib/interactionMotion';
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

interface CardMenuState {
  story: Story;
  x: number;
  y: number;
}

const FILTERS_STORAGE_KEY = 'kanban_v2_filters_v1';
const BOARD_COLUMN_ORDER: StoryStatus[] = ['backlog', 'todo', 'in_progress'];
const UNPROJECTED_FILTER_ID = '__unprojected__';
const UNPROJECTED_PROJECT: Project = {
  id: UNPROJECTED_FILTER_ID,
  team_id: '',
  name: 'Sin proyecto',
  prefix: 'Sin proyecto',
  color: '#8a8f98',
  icon_url: null,
  status: 'active',
  created_by: '',
  created_at: '',
};
const DONE_RANGE_LABELS: Record<DoneRange, string> = {
  week: 'Esta semana',
  month: 'Este mes',
  all: 'Siempre',
};

const isStory = (value: unknown): value is Story =>
  !!value && typeof value === 'object' && typeof (value as any).id === 'string' && typeof (value as any).status === 'string';

const KanbanBoard: Component<KanbanBoardProps> = (props) => {
  const data = useData();
  const auth = useAuth();

  const canHardDeleteStory = (_story: Story) => {
    // TODO: re-enable hard delete once the silent-failure bug is resolved.
    return false;
  };

  const [buckets, setBuckets] = createSignal<KanbanResponse | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [scope, setScope] = createSignal<Scope>('mine');
  const [selectedProjectIds, setSelectedProjectIds] = createSignal<string[]>([]);
  const [doneRange, setDoneRange] = createSignal<DoneRange>('week');
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);
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
  const [donePanelOpen, setDonePanelOpen] = createSignal(false);
  const [doneStories, setDoneStories] = createSignal<Story[]>([]);
  const [doneLoading, setDoneLoading] = createSignal(false);
  const [doneLoaded, setDoneLoaded] = createSignal(false);
  const [doneSelectedId, setDoneSelectedId] = createSignal<string | null>(null);

  let filtersLoaded = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let donePanelRef: HTMLDivElement | undefined;

  const drag = createKanbanDrag({
    onTap: (state) => {
      setFocusedColumn(state.fromStatus);
      setFocusedIndex(state.fromIndex);
      setSelectedStory(state.story);
    },
    onDragStart: (state) => {
      setFocusedColumn(state.fromStatus);
      setFocusedIndex(state.fromIndex);
    },
    onDrop: (storyId, target) => void dropStory(storyId, target),
  });

  const visible = createMemo(() => visibleBuckets(buckets(), searchQuery()));
  const activeProjects = () => [
    UNPROJECTED_PROJECT,
    ...data.projects().filter((project) => project.status === 'active'),
  ];
  const doneCount = () => buckets()?.done.total ?? 0;
  const doneRangeLabel = () => DONE_RANGE_LABELS[doneRange()];
  const selectedDoneStory = () => doneStories().find((story) => story.id === doneSelectedId()) ?? null;

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
      if (Array.isArray(parsed.projects)) {
        setSelectedProjectIds(parsed.projects.filter((id) => typeof id === 'string').slice(-1));
      }
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

  const filterKanbanBySelectedProjects = (next: KanbanResponse, selectedProjects: string[]): KanbanResponse => {
    if (selectedProjects.length === 0) return next;

    const includeUnprojected = selectedProjects.includes(UNPROJECTED_FILTER_ID);
    const realProjectIds = selectedProjects.filter((id) => id !== UNPROJECTED_FILTER_ID);
    const matchesProject = (story: Story) => {
      if (!story.project_id) return includeUnprojected;
      return realProjectIds.includes(story.project_id);
    };
    const filterBucket = (bucket: KanbanBucket): KanbanBucket => {
      const items = bucket.items.filter(matchesProject);
      return { ...bucket, items, total: items.length };
    };

    return {
      backlog: filterBucket(next.backlog),
      todo: filterBucket(next.todo),
      in_progress: filterBucket(next.in_progress),
      done: filterBucket(next.done),
    };
  };

  const loadKanban = async (opts: { silent?: boolean } = {}) => {
    const silent = opts.silent ?? !!buckets();
    if (!silent) setLoading(true);
    try {
      const selectedProjects = selectedProjectIds();
      const includesUnprojected = selectedProjects.includes(UNPROJECTED_FILTER_ID);
      // Production may not yet support the pseudo "Sin proyecto" id. When it is
      // selected, fetch the current scope broadly and apply the project filter
      // locally so unprojected backlog stories do not disappear into limbo.
      const next = await api.stories.kanban({
        scope: scope(),
        projects: includesUnprojected ? [] : selectedProjects,
        done_range: doneRange(),
      });
      setBuckets((prev) => mergeBuckets(prev, filterKanbanBySelectedProjects(next, selectedProjects)));
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
    if (projects.length > 0) {
      const includeUnprojected = projects.includes(UNPROJECTED_FILTER_ID);
      if (!story.project_id && !includeUnprojected) return false;
      if (story.project_id && !projects.includes(story.project_id)) return false;
    }
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

  const doneCompletedAfter = () => {
    if (doneRange() === 'all') return undefined;
    const days = doneRange() === 'week' ? 7 : 30;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  };

  const sortDoneStories = (stories: Story[]) =>
    [...stories].sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at));

  const loadDoneStories = async () => {
    if (!donePanelOpen()) return;
    setDoneLoading(true);
    try {
      const response = await api.stories.listPaged({
        status: 'done',
        limit: 200,
        offset: 0,
        completed_after: doneCompletedAfter(),
      });
      const filtered = (response.data as Story[]).filter(matchesCurrentFilters);
      setDoneStories(sortDoneStories(filtered));
      setDoneLoaded(true);
    } catch (err) {
      console.error('done stories load failed', err);
      showToast('No se pudo cargar Hecho');
    } finally {
      setDoneLoading(false);
    }
  };

  const patchDonePanelStory = (story: Story) => {
    setDoneStories((current) => {
      const without = current.filter((item) => item.id !== story.id);
      if (story.status !== 'done' || !matchesCurrentFilters(story)) return without;
      return sortDoneStories([story, ...without]);
    });
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
    if (donePanelOpen()) patchDonePanelStory(story);
  };

  const handleRealtime = (event: RealtimeEvent) => {
    if (!event.type.startsWith('story.')) return;
    if (event.type === 'story.deleted') {
      const id = event.id as string | undefined;
      if (!id) return void loadKanban({ silent: true });
      setBuckets((current) => current ? deleteStory(current, id) : current);
      setSelectedStory((current) => current?.id === id ? null : current);
      setDoneStories((current) => current.filter((story) => story.id !== id));
      setDoneSelectedId((current) => current === id ? null : current);
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
    setSelectedProjectIds((ids) => ids.includes(id) ? [] : [id]);
  };

  const quickAdd = async (title: string, status: StoryStatus) => {
    const payload: Record<string, unknown> = {
      title,
      status,
      priority: 'medium',
    };
    const uid = auth.user()?.id;
    if (uid) payload.assignee_id = uid;
    if (selectedProjectIds().length === 1 && selectedProjectIds()[0] !== UNPROJECTED_FILTER_ID) {
      payload.project_id = selectedProjectIds()[0];
    }

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
    if (status && BOARD_COLUMN_ORDER.includes(status)) {
      const index = ((current?.[status].items ?? []) as Story[]).findIndex((item) => item.id === story.id);
      setFocusedColumn(status);
      setFocusedIndex(Math.max(0, index));
    }
    setSelectedStory(story);
    setCardMenu(null);
  };

  const openDoneStory = (story: Story) => {
    setDonePanelOpen(true);
    setDoneSelectedId(story.id);
    setCardMenu(null);
  };

  const focusStoryById = (source: KanbanResponse | null, storyId: string) => {
    if (!source) return false;
    for (const status of BOARD_COLUMN_ORDER) {
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
    const snapshot = current;
    setMenuBusy(`move-${status}`);
    if (current) {
      const moved = moveStory(current, story.id, status, null, null);
      if (moved.story) setBuckets(moved.next);
    }
    if (status === 'done' && story.status !== 'done') {
      playInteractionSuccess({ source: 'kanban', tone: 'success' });
    }
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
      if (snapshot) setBuckets(snapshot);
      showToast('No se pudo mover la historia');
    } finally {
      setMenuBusy(null);
    }
  };

  const hideStoryFromMenu = async (story: Story) => {
    if (menuBusy()) return;
    const current = buckets();
    setMenuBusy('hide');
    if (current) setBuckets(deleteStory(current, story.id));
    setDoneStories((stories) => stories.filter((item) => item.id !== story.id));
    try {
      await api.stories.update(story.id, { is_active: false });
      setSelectedStory((item) => item?.id === story.id ? null : item);
      setDoneSelectedId((id) => id === story.id ? null : id);
      setCardMenu(null);
      setConfirmingMenuDelete(false);
      showToast('Historia ocultada', 'success');
    } catch (err) {
      console.error('hide story failed', err);
      if (current) setBuckets(current);
      if (donePanelOpen()) void loadDoneStories();
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
      setDoneStories((stories) => stories.filter((item) => item.id !== story.id));
      setSelectedStory((item) => item?.id === story.id ? null : item);
      setDoneSelectedId((id) => id === story.id ? null : id);
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

  const dropStory = async (storyId: string, target: DropTarget) => {
    const current = buckets();
    if (!current) return;
    const snapshot = current;
    const moved = moveStory(current, storyId, target.status, target.beforeId, target.afterId);
    if (!moved.story) return;
    setBuckets(moved.next);
    focusStoryById(moved.next, storyId);
    if (target.status === 'done' && moved.fromStatus !== 'done') {
      playInteractionSuccess({ source: 'kanban', tone: 'success' });
    }
    try {
      const updated = await api.stories.move(storyId, {
        to_status: target.status,
        before_id: target.beforeId,
        after_id: target.afterId,
      });
      applyRealtimeStory(updated as Story, target.beforeId, target.afterId);
      queueMicrotask(() => focusStoryById(buckets(), storyId));
    } catch (err) {
      console.error('move failed', err);
      setBuckets(snapshot);
      focusStoryById(snapshot, storyId);
      showToast('No se pudo mover la tarea');
    }
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
      if (drag.activeDrag()) {
        event.preventDefault();
        drag.cancelDrag();
        return;
      }
      if (cardMenu()) {
        setCardMenu(null);
        setConfirmingMenuDelete(false);
        return;
      }
      if (donePanelOpen()) {
        if (doneSelectedId()) {
          setDoneSelectedId(null);
        } else {
          setDonePanelOpen(false);
        }
        return;
      }
      if (shortcutsOpen()) return setShortcutsOpen(false);
      if (selectedStory()) return setSelectedStory(null);
      setFocusedIndex(0);
      return;
    }
    if (donePanelOpen()) {
      const stories = doneStories();
      const selectedIndex = Math.max(0, stories.findIndex((story) => story.id === doneSelectedId()));
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = stories[Math.min(stories.length - 1, selectedIndex + 1)];
        if (next) setDoneSelectedId(next.id);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const next = stories[Math.max(0, selectedIndex - 1)];
        if (next) setDoneSelectedId(next.id);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const current = stories[selectedIndex];
        if (current) setDoneSelectedId(current.id);
        return;
      }
    }
    if (event.key === '?') {
      event.preventDefault();
      setShortcutsOpen((open) => !open);
      return;
    }
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      const column = BOARD_COLUMN_ORDER.includes(focusedColumn()) ? focusedColumn() : 'todo';
      bumpQuickAdd(column);
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
      const current = Math.max(0, BOARD_COLUMN_ORDER.indexOf(focusedColumn()));
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      const next = BOARD_COLUMN_ORDER[Math.max(0, Math.min(BOARD_COLUMN_ORDER.length - 1, current + delta))];
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
      if (target instanceof HTMLElement && target.closest('[data-done-metric]')) return;
      if (donePanelOpen() && donePanelRef && target instanceof Node && !donePanelRef.contains(target)) {
        setDonePanelOpen(false);
      }
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

  createEffect(() => {
    if (!donePanelOpen()) return;
    scope();
    selectedProjectIds();
    doneRange();
    props.refreshKey;
    void loadDoneStories();
  });

  createEffect(() => {
    const stories = doneStories();
    if (!donePanelOpen() || doneLoading()) return;
    const selectedId = doneSelectedId();
    if (selectedId && stories.some((story) => story.id === selectedId)) return;
    setDoneSelectedId(stories[0]?.id ?? null);
  });

  createEffect(() => {
    if (!donePanelOpen()) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    onCleanup(() => {
      document.body.style.overflow = previous;
    });
  });

  const renderColumn = (status: StoryStatus) => {
    const b = visible();
    const bucket = b?.[status] ?? { items: [], total: 0 };
    const items = bucket.items as Story[];
    const target = drag.dropTarget();

    return (
      <KanbanColumn
        status={status}
        label={STATUS_LABELS[status]}
        count={bucket.total}
        stories={items}
        focused={focusedColumn() === status}
        quickAddToken={quickAddTokens()[status]}
        draggingId={drag.draggingId()}
        placeholderHeight={drag.activeDrag()?.height ?? null}
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
              dragging={drag.draggingId() === story.id}
              suppressClick={drag.suppressCardClick()}
              onOpen={() => {
                setFocusedColumn(status);
                setFocusedIndex(Math.max(0, index));
                setSelectedStory(story);
              }}
              onMenuOpen={openCardMenu}
              onPointerDownCard={(event, item, element) => drag.beginDrag(event, item, element, status, Math.max(0, index))}
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

      <div class="relative px-1">
        <div class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <FilterBar
              scope={scope()}
              onScopeChange={setScope}
              allProjects={activeProjects()}
              selectedProjectIds={selectedProjectIds()}
              onToggleProject={toggleProject}
              onClearProjects={() => setSelectedProjectIds([])}
            />
          </div>
          <DoneMetric
            count={doneCount()}
            rangeLabel={doneRangeLabel()}
            open={donePanelOpen()}
            onClick={() => setDonePanelOpen((open) => !open)}
          />
        </div>

        <Show when={donePanelOpen()}>
          <DoneStoriesModal
            panelRef={(element) => { donePanelRef = element; }}
            stories={doneStories()}
            selectedStory={selectedDoneStory()}
            loading={doneLoading()}
            loaded={doneLoaded()}
            range={doneRange()}
            count={doneCount()}
            onRangeChange={setDoneRange}
            onSelectStory={(story) => setDoneSelectedId(story.id)}
            onMenuOpen={openCardMenu}
            onClose={() => {
              setDonePanelOpen(false);
              setDoneSelectedId(null);
            }}
            onClearSelection={() => setDoneSelectedId(null)}
            getProject={(id) => id ? data.getProjectById(id) ?? null : null}
            onStoryDeleted={(story) => {
              setBuckets((current) => current ? deleteStory(current, story.id) : current);
              setDoneStories((stories) => stories.filter((item) => item.id !== story.id));
              setDoneSelectedId((id) => id === story.id ? null : id);
              props.onStoryDeleted?.();
            }}
            onStoryUpdated={(story, fields) => {
              const nextStory = { ...story, ...fields } as Story;
              setBuckets((current) => current ? updateStory(current, nextStory, matchesCurrentFilters) : current);
              patchDonePanelStory(nextStory);
            }}
          />
        </Show>
      </div>

      <Show when={!loading() || buckets()} fallback={<KanbanSkeleton />}>
        <div class="grid grid-cols-3 items-start gap-3 pb-4">
          <For each={BOARD_COLUMN_ORDER}>
            {(status) => (
              <div class="min-w-0">{renderColumn(status)}</div>
            )}
          </For>
        </div>
      </Show>

      <Show when={drag.activeDrag()?.started}>
        <DragGhost drag={drag.activeDrag()!} />
      </Show>

      <Show when={cardMenu()}>
        {(menu) => (
          <CardContextMenu
            story={menu().story}
            x={menu().x}
            y={menu().y}
            busy={menuBusy()}
            canHardDelete={canHardDeleteStory(menu().story)}
            onOpen={() => menu().story.status === 'done' && donePanelOpen() ? openDoneStory(menu().story) : openStory(menu().story)}
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
              const nextStory = { ...story(), ...fields } as Story;
              setBuckets((current) => {
                if (!current) return current;
                return updateStory(current, nextStory, matchesCurrentFilters);
              });
              patchDonePanelStory(nextStory);
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

const KanbanSkeleton: Component = () => (
  <div class="grid grid-cols-3 gap-3">
    {[0, 1, 2].map(() => (
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
