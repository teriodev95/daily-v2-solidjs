import {
  createSignal, createResource, createMemo, createEffect, onCleanup, onMount, For, Show, type Component
} from 'solid-js';
import { useRealtimeRefetch } from '../lib/realtime';
import { activeTab } from '../lib/activeTab';
import type { Story, StoryCompletion } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { isRecurringOnDate, isRecurring, toLocalDateStr } from '../lib/recurrence';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, CheckCircle2, Circle, X, Clock } from 'lucide-solid';
import StoryDetail from '../components/StoryDetail';
import TopNavigation from '../components/TopNavigation';

interface Props {
  refreshKey?: number;
  onRequestQuickAdd?: (date: string) => void;
}

const DAY_NAMES_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const buildMonth = (date: Date): Date[] => {
  const y = date.getFullYear();
  const m = date.getMonth();
  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);

  // Shift start of week to Monday
  let startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const days: Date[] = [];

  // Pad prev month
  const prevDate = new Date(firstDay);
  prevDate.setDate(prevDate.getDate() - startOffset);
  while (prevDate < firstDay) {
    days.push(new Date(prevDate));
    prevDate.setDate(prevDate.getDate() + 1);
  }

  // Current month
  let currDate = new Date(firstDay);
  while (currDate <= lastDay) {
    days.push(new Date(currDate));
    currDate.setDate(currDate.getDate() + 1);
  }

  // Pad next month to complete the row (42 cells max is safer to be uniform)
  let nextDate = new Date(lastDay);
  nextDate.setDate(nextDate.getDate() + 1);
  while (days.length % 7 !== 0) {
    days.push(new Date(nextDate));
    nextDate.setDate(nextDate.getDate() + 1);
  }
  // Ensure we always have 6 rows (42 days) so the grid doesn't bounce in height
  while (days.length < 42) {
    days.push(new Date(nextDate));
    nextDate.setDate(nextDate.getDate() + 1);
  }

  return days;
};

const buildWeek = (date: Date): Date[] => {
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);
  const day = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((day === 0 ? 7 : day) - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
};

const getISOWeekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const priorityColor: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-ios-blue-500/10 text-ios-blue-500 border-ios-blue-500/20',
  low: 'bg-base-content/5 text-base-content/60 border-transparent',
};

// ── Timeline constants (Apple Calendar-like) ───────────────────────────
const HOUR_HEIGHT = 60; // px per hour (1px per minute)
const DAY_START_HOUR = 5; // 5 a.m.
const DAY_END_HOUR = 23; // 11 p.m.
const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR + 1;
const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const TIME_GUTTER_WIDTH = 56; // px for the left-side hour labels

// Read time fields. Soft-cast keeps this resilient if the Story type lags behind a
// partial migration (no-op once start_time/end_time are present on the type).
const getStartTime = (s: Story): string | null => (s as any).start_time ?? null;
const getEndTime = (s: Story): string | null => (s as any).end_time ?? null;

// "HH:mm" -> { h, m }. Returns null on bad input.
const parseHHmm = (s: string | null | undefined): { h: number; m: number } | null => {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return { h: Math.max(0, Math.min(23, h)), m: Math.max(0, Math.min(59, mm)) };
};

// Minutes since DAY_START_HOUR (clamped to timeline range).
const minutesSinceDayStart = (hhmm: string | null | undefined): number => {
  const p = parseHHmm(hhmm);
  if (!p) return 0;
  return (p.h - DAY_START_HOUR) * 60 + p.m;
};

const topPx = (hhmm: string | null | undefined): number => {
  const m = minutesSinceDayStart(hhmm);
  // Clamp inside the timeline so events that start before 5am still render at the top.
  const clamped = Math.max(0, Math.min(TOTAL_HOURS * 60, m));
  return clamped * (HOUR_HEIGHT / 60);
};

const heightPx = (start: string | null | undefined, end: string | null | undefined): number => {
  const s = parseHHmm(start);
  if (!s) return HOUR_HEIGHT; // default 1h block when no end provided
  const e = parseHHmm(end);
  if (!e) return HOUR_HEIGHT;
  const startMin = s.h * 60 + s.m;
  const endMin = e.h * 60 + e.m;
  const duration = Math.max(15, endMin - startMin); // minimum 15min visual height
  return duration * (HOUR_HEIGHT / 60);
};

// Snap granularity for drag-resize and drag-move on the timeline.
const SNAP_MINUTES = 15;

// "HH:mm" -> absolute minutes from 00:00, or null on bad input.
const hhmmToMinutes = (hhmm: string | null | undefined): number | null => {
  const p = parseHHmm(hhmm);
  return p ? p.h * 60 + p.m : null;
};

// Absolute minutes -> "HH:mm" (clamped to 00:00–23:59).
const minutesToHHmm = (totalMinutes: number): string => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Round to the nearest SNAP_MINUTES bucket.
const snapToStep = (totalMinutes: number, step: number = SNAP_MINUTES): number =>
  Math.round(totalMinutes / step) * step;

// "5 a.m.", "12 p.m.", "1 p.m.", "11 p.m."
const formatHourLabel = (h: number): string => {
  if (h === 0) return '12 a.m.';
  if (h === 12) return '12 p.m.';
  if (h < 12) return `${h} a.m.`;
  return `${h - 12} p.m.`;
};

// "07:00" -> "7 a.m.", "14:30" -> "2:30 p.m.", "12:00" -> "12 p.m."
const formatTimeShort = (hhmm: string | null | undefined): string => {
  const p = parseHHmm(hhmm);
  if (!p) return '';
  const suffix = p.h < 12 ? 'a.m.' : 'p.m.';
  let h12 = p.h % 12;
  if (h12 === 0) h12 = 12;
  if (p.m === 0) return `${h12} ${suffix}`;
  return `${h12}:${String(p.m).padStart(2, '0')} ${suffix}`;
};

// Now indicator (current HH:mm string).
const currentHHmm = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Returns true if current time is inside the visible timeline window.
const isNowInRange = (): boolean => {
  const h = new Date().getHours();
  return h >= DAY_START_HOUR && h <= DAY_END_HOUR;
};

// Google Calendar-style stacked layout. Each event keeps full column width
// and gets a "depth" = how many earlier-in-sort events overlap it. The depth
// drives a small lateral offset + z-index, so a short event nested inside a
// long one renders on top with a visible indent (clearer than splitting the
// column into thin lanes).
//
// Sort order: longest duration first, then earliest start, then stable input
// order. That puts the natural "container" at depth 0 and any inner events
// stack on top of it.
const STACK_OFFSET_PX = 14; // px per nesting level (left indent) — leaves a draggable lane on the parent
const computeStackDepth = <T extends { start: number; end: number }>(items: T[]): Map<T, number> => {
  const depth = new Map<T, number>();
  const sorted = [...items].sort((a, b) =>
    (b.end - b.start) - (a.end - a.start) || (a.start - b.start),
  );
  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    let d = 0;
    for (let j = 0; j < i; j++) {
      const other = sorted[j];
      // other comes before it in the sort (longer / starts earlier). It
      // counts toward depth when it temporally overlaps `it` at the start.
      if (other.start <= it.start && other.end > it.start) d++;
    }
    depth.set(it, d);
  }
  return depth;
};

const HOURS_RANGE: number[] = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i);

const CalendarPage: Component<Props> = (props) => {
  const auth = useAuth();
  const data = useData();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentWeekStart = buildWeek(today)[0];

  // Persisted calendar state (last view, last navigated date, last user filter).
  // Versioned key so a shape change in the future doesn't break old caches.
  const CALENDAR_STATE_KEY = 'dc-calendar-state-v1';
  type StoredState = { view?: 'day' | 'week' | 'month'; baseDate?: string; selectedUserIds?: string[] };
  const readStoredState = (): StoredState | null => {
    try {
      const raw = localStorage.getItem(CALENDAR_STATE_KEY);
      return raw ? JSON.parse(raw) as StoredState : null;
    } catch { return null; }
  };
  const stored = readStoredState();

  const [view, setView] = createSignal<'day' | 'week' | 'month'>(stored?.view ?? 'month');
  const [baseDate, setBaseDate] = createSignal(
    stored?.baseDate ? new Date(stored.baseDate) : today,
  );
  const [selectedDay, setSelectedDay] = createSignal<Date>(today);
  const [showDayModal, setShowDayModal] = createSignal(false);
  const [selectedStoryForDetail, setSelectedStoryForDetail] = createSignal<Story | null>(null);

  const userId = () => auth.user()?.id ?? '';

  const [selectedUserIds, setSelectedUserIds] = createSignal<string[]>(stored?.selectedUserIds ?? []);
  const [filterInitialized, setFilterInitialized] = createSignal(!!stored?.selectedUserIds?.length);

  createEffect(() => {
    const uid = userId();
    if (uid && !filterInitialized()) {
      setSelectedUserIds([uid]);
      setFilterInitialized(true);
    }
  });

  // Persist view/date/filter on any change. Cheap (single localStorage write per tick).
  createEffect(() => {
    const state: StoredState = {
      view: view(),
      baseDate: baseDate().toISOString(),
      selectedUserIds: selectedUserIds(),
    };
    try { localStorage.setItem(CALENDAR_STATE_KEY, JSON.stringify(state)); } catch {}
  });

  const [stories, { mutate: mutateStories, refetch: refetchStories }] = createResource(
    () => ({ _r: props.refreshKey }),
    async () => {
      const list = await api.stories.list({});
      return list as (Story & { assignees?: string[] })[];
    }
  );

  const userMatchesSelection = (s: Story & { assignees?: string[] }, selected: Set<string>) => {
    if (selected.size === 0) return false;
    if (s.assignee_id && selected.has(s.assignee_id)) return true;
    if (s.assignees && s.assignees.some((id) => selected.has(id))) return true;
    return false;
  };

  const visibleDays = createMemo(() => {
    const v = view();
    if (v === 'month') return buildMonth(baseDate());
    if (v === 'week') return buildWeek(baseDate());
    // day view: just the single base date (used for itemsByDate map + range query)
    const d = new Date(baseDate());
    d.setHours(0, 0, 0, 0);
    return [d];
  });

  const visibleWeeks = createMemo(() => {
    const days = visibleDays();
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  });

  const rangeStr = createMemo(() => {
    const days = visibleDays();
    if (days.length === 0) return { from: '', to: '' };
    return {
      from: toLocalDateStr(days[0]),
      to: toLocalDateStr(days[days.length - 1]),
    };
  });

  const [completions, { mutate: mutateCompletions, refetch: refetchCompletions }] = createResource(
    () => ({ uid: userId(), from: rangeStr().from, to: rangeStr().to }),
    async ({ uid, from, to }) => {
      if (!uid) return [];
      return api.completions.list(from, to);
    }
  );

  const completionSet = createMemo(() => {
    const set = new Set<string>();
    for (const c of completions() ?? []) {
      set.add(`${c.story_id}:${c.completion_date}`);
    }
    return set;
  });

  // Realtime sync: refetch on story/completion changes from other clients.
  onMount(() => {
    const unsub = useRealtimeRefetch(
      ['story.', 'completion.'],
      () => {
        void refetchStories();
        void refetchCompletions();
      },
      { isActive: () => activeTab() === 'calendar' },
    );
    onCleanup(unsub);
  });

  const isCompletedOn = (storyId: string, dateKey: string) => completionSet().has(`${storyId}:${dateKey}`);

  // Now indicator tick: re-render minute-by-minute when day/week view active so the red
  // "current time" line stays accurate. Keeps things simple — just bumps a signal.
  const [nowTick, setNowTick] = createSignal(Date.now());
  onMount(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    onCleanup(() => window.clearInterval(id));
  });
  // Compute current top position (in px) inside the timeline. nowTick is read so the
  // memo re-runs every minute.
  const nowTopPx = createMemo(() => { nowTick(); return topPx(currentHHmm()); });
  const nowVisible = createMemo(() => { nowTick(); return isNowInRange(); });

  const itemsByDate = createMemo(() => {
    const all = stories() ?? [];
    const selected = new Set(selectedUserIds());
    const map = new Map<string, { story: Story; isRecurring: boolean; isCompleted: boolean }[]>();

    for (const d of visibleDays()) {
      const dateKey = toLocalDateStr(d);
      const items = [];

      for (const s of all) {
        if (!userMatchesSelection(s, selected)) continue;

        if (isRecurring(s)) {
          if (s.status !== 'done' && isRecurringOnDate(s, d)) {
            items.push({ story: s, isRecurring: true, isCompleted: isCompletedOn(s.id, dateKey) });
          }
          continue;
        }

        if (s.status === 'done') continue;
        const targetDate = s.scheduled_date ?? s.due_date;
        if (!targetDate) continue;
        if (targetDate.split('T')[0] === dateKey) {
          items.push({ story: s, isRecurring: false, isCompleted: false });
        }
      }

      // Sort
      const p: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      items.sort((a, b) => (p[a.story.priority] ?? 9) - (p[b.story.priority] ?? 9));

      if (items.length > 0) map.set(dateKey, items);
    }
    return map;
  });

  const goPrev = () => {
    const d = new Date(baseDate());
    const v = view();
    if (v === 'month') d.setMonth(d.getMonth() - 1);
    else if (v === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setBaseDate(d);
  };

  const goNext = () => {
    const d = new Date(baseDate());
    const v = view();
    if (v === 'month') d.setMonth(d.getMonth() + 1);
    else if (v === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setBaseDate(d);
  };

  const goToday = () => {
    setBaseDate(today);
    setSelectedDay(today);
  };

  const toggleCompletion = async (storyId: string, dateKey: string, currentlyCompleted: boolean) => {
    if (currentlyCompleted) {
      mutateCompletions(prev => (prev ?? []).filter(c => !(c.story_id === storyId && c.completion_date === dateKey)));
      api.completions.delete(storyId, dateKey).catch(() => {});
    } else {
      const optimistic: StoryCompletion = {
        id: `temp-${Date.now()}`,
        story_id: storyId,
        user_id: userId(),
        completion_date: dateKey,
        created_at: new Date().toISOString(),
      };
      mutateCompletions(prev => [...(prev ?? []), optimistic]);
      api.completions.create(storyId, dateKey).catch(() => {});
    }
  };

  const markStoryDone = async (storyId: string) => {
    const t = new Date().toISOString();
    mutateStories(prev => (prev ?? []).map(s => s.id === storyId ? { ...s, status: 'done', completed_at: t } : s));
    api.stories.update(storyId, { status: 'done', completed_at: t }).catch(() => {});
  };

  const formatHeader = () => {
    const v = view();
    if (v === 'month') {
      const m = baseDate().getMonth();
      const y = baseDate().getFullYear();
      return `${MONTH_NAMES[m].charAt(0).toUpperCase() + MONTH_NAMES[m].slice(1)} ${y}`;
    }
    if (v === 'day') {
      const d = baseDate();
      return `${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    }
    const days = visibleDays();
    if (!days.length) return '';
    const f = days[0];
    const l = days[days.length - 1];
    if (f.getMonth() === l.getMonth()) return `${MONTH_NAMES[f.getMonth()]} ${f.getFullYear()}`;
    return `${MONTH_NAMES[f.getMonth()]} – ${MONTH_NAMES[l.getMonth()]} ${l.getFullYear()}`;
  };

  const handleCellClick = (d: Date) => {
    setSelectedDay(d);
    setShowDayModal(true);
  };

  // ── QuickAdd popover (Google Calendar-style) ──
  // Anchored to the click point; supports all-day (from month / all-day band)
  // and timed (from week/day timeline columns) creation.
  type QuickAddState = {
    dateKey: string;
    startTime: string | null;
    endTime: string | null;
    anchorX: number; // viewport coords
    anchorY: number;
  };
  const [quickAdd, setQuickAdd] = createSignal<QuickAddState | null>(null);
  const [quickAddTitle, setQuickAddTitle] = createSignal('');
  const [quickAddSubmitting, setQuickAddSubmitting] = createSignal(false);
  const [quickAddError, setQuickAddError] = createSignal<string | null>(null);
  let quickAddInputRef: HTMLInputElement | undefined;

  const openQuickAdd = (e: MouseEvent, dateKey: string, startTime: string | null, endTime: string | null) => {
    e.stopPropagation();
    setQuickAdd({ dateKey, startTime, endTime, anchorX: e.clientX, anchorY: e.clientY });
    setQuickAddTitle('');
    setQuickAddSubmitting(false);
    setQuickAddError(null);
    // Focus input next tick (after Show renders the element).
    queueMicrotask(() => quickAddInputRef?.focus());
  };

  const closeQuickAdd = () => {
    setQuickAdd(null);
    setQuickAddTitle('');
    setQuickAddSubmitting(false);
    setQuickAddError(null);
  };

  const submitQuickAdd = async () => {
    const state = quickAdd();
    const title = quickAddTitle().trim();
    if (!state || !title || quickAddSubmitting()) return;
    setQuickAddSubmitting(true);
    setQuickAddError(null);
    // Assign to whichever user is active in the top filter — that's the
    // calendar the user is looking at right now. Fallback to the logged-in
    // user when no filter is active so the HU doesn't get filtered out.
    const assigneeId = selectedUserIds()[0] ?? userId();
    const payload: Record<string, unknown> = {
      title,
      due_date: state.dateKey,
      scheduled_date: state.dateKey,
      ...(assigneeId ? { assignee_id: assigneeId } : {}),
    };
    if (state.startTime && state.endTime) {
      payload.start_time = state.startTime;
      payload.end_time = state.endTime;
    }
    try {
      const created = await api.stories.create(payload);
      // Optimistic insert — the new story is visible immediately, before refetch.
      mutateStories((prev) => [...(prev ?? []), created as any]);
      closeQuickAdd();
      // Refetch in background to reconcile with any server-side defaults.
      void refetchStories();
    } catch (err: any) {
      const msg = err?.message || err?.body?.error || 'No se pudo crear la HU';
      setQuickAddError(typeof msg === 'string' ? msg : 'No se pudo crear la HU');
      setQuickAddSubmitting(false);
    }
  };

  const openQuickAddMoreOptions = () => {
    const state = quickAdd();
    if (!state) return;
    closeQuickAdd();
    props.onRequestQuickAdd?.(state.dateKey);
  };

  // Compute (startTime, endTime) from a click on a timeline column.
  // Returns a 1-hour block snapped to SNAP_MINUTES.
  const timelineClickToTimeRange = (e: MouseEvent): { startTime: string; endTime: string } | null => {
    const col = e.currentTarget as HTMLElement;
    if (!col) return null;
    const rect = col.getBoundingClientRect();
    const offsetY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const minutesFromTop = (offsetY / HOUR_HEIGHT) * 60;
    const snapped = snapToStep(minutesFromTop);
    const absStart = DAY_START_HOUR * 60 + snapped;
    const maxStart = 23 * 60 + 59 - 60;
    const clampedStart = Math.max(0, Math.min(maxStart, absStart));
    return { startTime: minutesToHHmm(clampedStart), endTime: minutesToHHmm(clampedStart + 60) };
  };

  const handleQuickAddClick = (e: MouseEvent, d: Date) => {
    e.stopPropagation();
    openQuickAdd(e, toLocalDateStr(d), null, null);
    setShowDayModal(false);
  };

  // Single-select: clicking a chip replaces the active user. Clicking the
  // already-active user clears the filter. Avoids the multi-select chaos in
  // the timeline (overlapping events from many people).
  const toggleUserFilter = (id: string) => {
    setSelectedUserIds((prev) => (prev[0] === id ? [] : [id]));
  };

  const clearUserFilter = () => setSelectedUserIds([]);

  const activeTeam = () => data.users().filter((u) => u.is_active);

  // ── Drag & drop ───────────────────────────────────────────
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dragHoverKey, setDragHoverKey] = createSignal<string | null>(null);
  const [justDroppedId, setJustDroppedId] = createSignal<string | null>(null);

  // Payload carried over the drag wire. startTimeStr/durationMin let timeline
  // drops reposition the event in time (preserving duration) when the cursor
  // lands on a timeline column, while month drops fall back to date-only moves.
  type DragPayload = {
    id: string;
    from: string;
    field: 'scheduled_date' | 'due_date';
    startTimeStr: string | null;
    durationMin: number | null;
  };

  const handleDragStart = (
    e: DragEvent,
    story: Story,
    sourceKey: string,
  ) => {
    if (isRecurring(story) || !e.dataTransfer) return;
    const field: 'scheduled_date' | 'due_date' = story.scheduled_date ? 'scheduled_date' : 'due_date';
    const startStr = getStartTime(story);
    const endStr = getEndTime(story);
    const startMin = hhmmToMinutes(startStr);
    const endMin = hhmmToMinutes(endStr);
    const durationMin =
      startMin != null && endMin != null ? Math.max(SNAP_MINUTES, endMin - startMin) : null;
    const payload: DragPayload = {
      id: story.id,
      from: sourceKey,
      field,
      startTimeStr: startStr,
      durationMin,
    };
    const serialized = JSON.stringify(payload);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-daily-story', serialized);
    e.dataTransfer.setData('text/plain', serialized);
    setDraggingId(story.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragHoverKey(null);
    setDropTimeHint(null);
  };

  const handleDragOverCell = (e: DragEvent, dateKey: string) => {
    if (!draggingId()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (dragHoverKey() !== dateKey) setDragHoverKey(dateKey);
  };

  const handleDragLeaveCell = (dateKey: string) => {
    if (dragHoverKey() === dateKey) setDragHoverKey(null);
  };

  // Live ghost while dragging over a timeline column: shows where the event
  // would land (snapped) and what its new start time would be.
  type DropTimeHint = { dateKey: string; topPx: number; startTimeStr: string };
  const [dropTimeHint, setDropTimeHint] = createSignal<DropTimeHint | null>(null);

  const computeTimelineDrop = (e: DragEvent, columnEl: HTMLElement): { startMin: number; topPx: number } | null => {
    if (!columnEl) return null;
    const rect = columnEl.getBoundingClientRect();
    const offsetY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const minutesFromTop = (offsetY / HOUR_HEIGHT) * 60;
    const snapped = snapToStep(minutesFromTop);
    const startMin = DAY_START_HOUR * 60 + snapped;
    return { startMin, topPx: snapped * (HOUR_HEIGHT / 60) };
  };

  const handleDragOverTimeline = (e: DragEvent, dateKey: string) => {
    if (!draggingId()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (dragHoverKey() !== dateKey) setDragHoverKey(dateKey);
    const drop = computeTimelineDrop(e, e.currentTarget as HTMLElement);
    if (!drop) return;
    setDropTimeHint({ dateKey, topPx: drop.topPx, startTimeStr: minutesToHHmm(drop.startMin) });
  };

  const handleDropCell = async (e: DragEvent, targetKey: string) => {
    e.preventDefault();
    setDragHoverKey(null);
    setDraggingId(null);
    setDropTimeHint(null);

    const raw = e.dataTransfer?.getData('application/x-daily-story')
      ?? e.dataTransfer?.getData('text/plain');
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const current = (stories() ?? []).find((s) => s.id === payload.id);
    if (!current || isRecurring(current)) return;

    if (payload.from === targetKey) return;

    const previous = { [payload.field]: (current as any)[payload.field] } as Record<string, unknown>;
    const patch = { [payload.field]: targetKey } as Record<string, unknown>;

    mutateStories((prev) =>
      (prev ?? []).map((s) => (s.id === payload.id ? { ...s, ...patch } : s)) as any,
    );

    setJustDroppedId(payload.id);
    window.setTimeout(() => {
      setJustDroppedId((id) => (id === payload.id ? null : id));
    }, 620);

    try {
      await api.stories.update(payload.id, patch);
    } catch {
      mutateStories((prev) =>
        (prev ?? []).map((s) => (s.id === payload.id ? { ...s, ...previous } : s)) as any,
      );
    }
  };

  // Drop on a Week/Day timeline column. Reads the Y offset to derive a new
  // start_time (snapped). Preserves the existing duration when the source had
  // both times; defaults to a 1h block when promoting an "all-day" event.
  const handleDropOnTimelineCell = async (e: DragEvent, targetKey: string) => {
    e.preventDefault();
    setDragHoverKey(null);
    setDraggingId(null);
    setDropTimeHint(null);

    const raw = e.dataTransfer?.getData('application/x-daily-story')
      ?? e.dataTransfer?.getData('text/plain');
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const current = (stories() ?? []).find((s) => s.id === payload.id);
    if (!current || isRecurring(current)) return;

    const drop = computeTimelineDrop(e, e.currentTarget as HTMLElement);
    if (!drop) return;

    const duration = payload.durationMin ?? 60;
    const maxStart = 23 * 60 + 59 - duration;
    const newStartMin = Math.max(0, Math.min(maxStart, drop.startMin));
    const newEndMin = newStartMin + duration;
    const newStartTime = minutesToHHmm(newStartMin);
    const newEndTime = minutesToHHmm(newEndMin);

    // No-op if dropped exactly where it already was.
    const samePosition =
      payload.from === targetKey &&
      getStartTime(current) === newStartTime &&
      getEndTime(current) === newEndTime;
    if (samePosition) return;

    const patch: Record<string, unknown> = {
      [payload.field]: targetKey,
      start_time: newStartTime,
      end_time: newEndTime,
    };
    const previous: Record<string, unknown> = {
      [payload.field]: (current as any)[payload.field],
      start_time: getStartTime(current),
      end_time: getEndTime(current),
    };

    mutateStories((prev) =>
      (prev ?? []).map((s) => (s.id === payload.id ? { ...s, ...patch } : s)) as any,
    );

    setJustDroppedId(payload.id);
    window.setTimeout(() => {
      setJustDroppedId((id) => (id === payload.id ? null : id));
    }, 620);

    try {
      await api.stories.update(payload.id, patch);
    } catch {
      mutateStories((prev) =>
        (prev ?? []).map((s) => (s.id === payload.id ? { ...s, ...previous } : s)) as any,
      );
    }
  };

  // ── Resize (drag the bottom edge of a timed block) ──
  type ResizeState = {
    storyId: string;
    startTimeStr: string;
    initialEndMin: number;
    initialClientY: number;
    currentEndTimeStr: string;
  };
  const [resizing, setResizing] = createSignal<ResizeState | null>(null);

  const startResize = (e: MouseEvent, story: Story) => {
    const startStr = getStartTime(story);
    const endStr = getEndTime(story);
    if (!startStr || !endStr) return;
    const endMin = hhmmToMinutes(endStr);
    if (endMin == null) return;
    e.stopPropagation();
    e.preventDefault();
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    setResizing({
      storyId: story.id,
      startTimeStr: startStr,
      initialEndMin: endMin,
      initialClientY: e.clientY,
      currentEndTimeStr: endStr,
    });
  };

  const onResizeMove = (e: MouseEvent) => {
    const state = resizing();
    if (!state) return;
    const deltaPx = e.clientY - state.initialClientY;
    const deltaMin = deltaPx / (HOUR_HEIGHT / 60);
    const startMin = hhmmToMinutes(state.startTimeStr) ?? 0;
    const snapped = snapToStep(state.initialEndMin + deltaMin);
    const constrained = Math.max(startMin + SNAP_MINUTES, Math.min(23 * 60 + 59, snapped));
    const next = minutesToHHmm(constrained);
    if (next !== state.currentEndTimeStr) {
      setResizing({ ...state, currentEndTimeStr: next });
    }
  };

  const endResize = async () => {
    const state = resizing();
    if (!state) return;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setResizing(null);
    const initialEnd = minutesToHHmm(state.initialEndMin);
    if (state.currentEndTimeStr === initialEnd) return;
    const patch = { start_time: state.startTimeStr, end_time: state.currentEndTimeStr };
    const previous = { start_time: state.startTimeStr, end_time: initialEnd };
    mutateStories((prev) =>
      (prev ?? []).map((s) => (s.id === state.storyId ? { ...s, ...patch } : s)) as any,
    );
    try {
      await api.stories.update(state.storyId, patch);
    } catch {
      mutateStories((prev) =>
        (prev ?? []).map((s) => (s.id === state.storyId ? { ...s, ...previous } : s)) as any,
      );
    }
  };

  onMount(() => {
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', endResize);
  });
  onCleanup(() => {
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', endResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  return (
    <>
      <TopNavigation
        breadcrumbs={[
          { label: "Calendario", icon: <CalendarDays size={14} /> },
          { label: formatHeader() },
        ]}
        center={
          <div class="grid h-10 w-[156px] grid-cols-[36px_1fr_36px] items-center rounded-[18px] border border-base-content/[0.055] bg-base-content/[0.025] p-1 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Mes anterior"
              class="flex h-8 w-8 items-center justify-center rounded-[14px] text-base-content/38 transition-colors hover:bg-base-content/[0.055] hover:text-base-content/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/25"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={goToday}
              class="flex h-8 items-center justify-center rounded-[14px] px-3 text-[12px] font-semibold text-base-content/62 transition-colors hover:bg-base-content/[0.055] hover:text-base-content/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/25"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Mes siguiente"
              class="flex h-8 w-8 items-center justify-center rounded-[14px] text-base-content/38 transition-colors hover:bg-base-content/[0.055] hover:text-base-content/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/25"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        }
        actions={
          <div class="relative grid h-9 w-[228px] grid-cols-3 items-center rounded-[18px] border border-base-content/[0.055] bg-base-content/[0.025] p-1 shrink-0">
            <div
              aria-hidden="true"
              class="absolute left-1 top-1 h-7 rounded-[14px] border border-base-content/[0.045] bg-base-100/95 shadow-[0_1px_6px_rgba(15,23,42,0.08)] transition-transform duration-200 ease-out"
              style={{
                width: 'calc((100% - 8px) / 3)',
                transform: view() === 'day'
                  ? 'translateX(0)'
                  : view() === 'week'
                    ? 'translateX(100%)'
                    : 'translateX(200%)',
              }}
            />
            <button
              type="button"
              onClick={() => setView('day')}
              aria-pressed={view() === 'day'}
              class={`relative z-10 h-7 rounded-[14px] text-center text-[11px] font-semibold transition-colors ${
                view() === 'day' ? 'text-base-content' : 'text-base-content/42 hover:text-base-content/68'
              }`}
            >
              Día
            </button>
            <button
              type="button"
              onClick={() => setView('week')}
              aria-pressed={view() === 'week'}
              class={`relative z-10 h-7 rounded-[14px] text-center text-[11px] font-semibold transition-colors ${
                view() === 'week' ? 'text-base-content' : 'text-base-content/42 hover:text-base-content/68'
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setView('month')}
              aria-pressed={view() === 'month'}
              class={`relative z-10 h-7 rounded-[14px] text-center text-[11px] font-semibold transition-colors ${
                view() === 'month' ? 'text-base-content' : 'text-base-content/42 hover:text-base-content/68'
              }`}
            >
              Mes
            </button>
          </div>
        }
      />
      <div class="flex flex-col pt-0 min-h-screen">

      {/* ── User Filter ── */}
      <div class="flex items-center gap-2 mb-3 -mx-1">
        <div class="flex items-center gap-2 overflow-x-auto py-1.5 px-1 scrollbar-none flex-1 min-w-0">
          <For each={activeTeam()}>
            {(member) => {
              const active = () => selectedUserIds().includes(member.id);
              const isMe = () => member.id === userId();
              return (
                <button
                  type="button"
                  onClick={() => toggleUserFilter(member.id)}
                  aria-pressed={active()}
                  class={`group flex items-center gap-2 px-3.5 py-2 rounded-[14px] text-xs font-semibold whitespace-nowrap transition-all duration-300 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-content/20 ${
                    active()
                      ? 'bg-base-100 text-base-content ring-2 ring-ios-blue-500 shadow-md shadow-ios-blue-500/15 scale-[1.02]'
                      : 'bg-base-200/50 text-base-content/60 hover:bg-base-200 hover:text-base-content/90 border border-base-content/[0.04]'
                  }`}
                >
                  <Show
                    when={member.avatar_url}
                    fallback={
                      <div class="w-5 h-5 rounded-full bg-base-content/10 flex items-center justify-center text-[9px] font-bold text-base-content/40 shrink-0">
                        {member.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                    }
                  >
                    <img
                      src={member.avatar_url!}
                      alt=""
                      class={`w-5 h-5 rounded-full object-cover transition-all ${
                        active() ? 'shadow-sm' : 'group-hover:ring-2 group-hover:ring-base-content/10'
                      }`}
                    />
                  </Show>
                  <span>{member.name.split(' ')[0]}</span>
                  <Show when={isMe()}>
                    <span class="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-ios-blue-500/15 text-ios-blue-500">
                      tú
                    </span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
        <Show when={selectedUserIds().length > 0}>
          <button
            type="button"
            onClick={clearUserFilter}
            aria-label="Limpiar filtros de usuario"
            class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-medium text-base-content/50 hover:text-base-content hover:bg-base-content/5 transition-all shrink-0"
          >
            <X size={12} />
            Limpiar
          </button>
        </Show>
      </div>

      {/* ── Month Grid ── */}
      <Show when={view() === 'month'}>
      <div class="flex-1 bg-base-200/30 rounded-2xl border border-base-content/[0.08] overflow-hidden flex flex-col shadow-sm">

        {/* Days Header */}
        <div class="grid grid-cols-[38px_repeat(7,minmax(0,1fr))] sm:grid-cols-[46px_repeat(7,minmax(0,1fr))] border-b border-base-content/[0.08] bg-base-100/50 backdrop-blur-md">
          <div class="py-2 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-base-content/24 bg-base-content/[0.012] border-r border-base-content/[0.045]">
            Sem
          </div>
          <For each={DAY_NAMES_SHORT}>
            {(name) => (
              <div class="py-2 text-center text-[11px] font-bold uppercase tracking-widest text-base-content/40">
                {name}
              </div>
            )}
          </For>
        </div>

        {/* Calendar Body */}
        <div class={`grid flex-1 ${view() === 'month' ? 'auto-rows-fr' : 'min-h-[160px]'}`}>
          <For each={visibleWeeks()}>
            {(week) => {
              const isCurrentWeek = () => isSameDay(week[0], currentWeekStart);
              return (
                <div class="grid min-h-0 grid-cols-[38px_repeat(7,minmax(0,1fr))] sm:grid-cols-[46px_repeat(7,minmax(0,1fr))]">
                  <div class="flex items-start justify-center border-r border-b border-base-content/[0.04] bg-base-content/[0.012] px-1 py-2">
                    <span class={`mt-0.5 inline-flex h-6 min-w-7 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums transition-colors ${
                      isCurrentWeek()
                        ? 'bg-ios-blue-500/12 text-ios-blue-500 ring-1 ring-ios-blue-500/18'
                        : 'text-base-content/24'
                    }`}>
                      {getISOWeekNumber(week[0])}
                    </span>
                  </div>
                <For each={week}>
                  {(d) => {
                    const dateKey = toLocalDateStr(d);
                    const isCurrentMonth = () => d.getMonth() === baseDate().getMonth();
                    const items = () => itemsByDate().get(dateKey) ?? [];
                    const isToday = isSameDay(d, today);
                    const isSelected = () => isSameDay(d, selectedDay());

                    const isDropHover = () => dragHoverKey() === dateKey;
                    return (
                      <div
                        onClick={(e) => {
                          // Skip if the click landed on a child interactive element (HU card, Plus button).
                          if (e.target !== e.currentTarget) return;
                          openQuickAdd(e, dateKey, null, null);
                        }}
                        onDragOver={(e) => handleDragOverCell(e, dateKey)}
                        onDragLeave={() => handleDragLeaveCell(dateKey)}
                        onDrop={(e) => handleDropCell(e, dateKey)}
                        class={`relative flex flex-col border-r border-b border-base-content/[0.04] transition-all p-1 sm:p-2 cursor-pointer group ${
                          isDropHover()
                            ? 'bg-ios-blue-500/10 ring-2 ring-inset ring-ios-blue-500/50 scale-[0.99]'
                            : isSelected()
                              ? 'bg-ios-blue-500/[0.02] ring-1 ring-inset ring-ios-blue-500/20'
                              : 'hover:bg-base-content/[0.02]'
                        } ${!isCurrentMonth() && view() === 'month' ? 'opacity-40 bg-base-200/50' : 'bg-base-100/30'}`}
                      >
                  <div class="flex items-start justify-between mb-1">
                    <div class={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[11px] sm:text-[13px] font-bold transition-all ${
                      isToday
                         ? 'bg-ios-blue-500 text-white shadow-sm'
                         : isSelected()
                           ? 'text-ios-blue-500'
                           : 'text-base-content/60'
                    }`}>
                      {d.getDate()}
                    </div>
                    
                    {/* Hover Add Task Button */}
                    <button
                      onClick={(e) => handleQuickAddClick(e, d)}
                      class="opacity-0 group-hover:opacity-100 p-1 bg-base-content/5 hover:bg-base-content/10 text-base-content/50 hover:text-base-content/80 rounded-md transition-all active:scale-95"
                      title="Agregar tarea en este día"
                    >
                      <Plus size={14} strokeWidth={2.5} />
                    </button>
                  </div>

                  {/* Tasks inside cell (Desktop only) */}
                  <div class="flex-1 overflow-y-auto scrollbar-none hidden sm:flex flex-col gap-1 w-full pb-1">
                    <For each={items().slice(0, view() === 'month' ? 4 : undefined)}>
                      {(item) => {
                        const styleDesc = priorityColor[item.story.priority] || priorityColor.low;
                        const proj = item.story.project_id ? data.getProjectById(item.story.project_id) : null;
                        const isDragging = () => draggingId() === item.story.id;
                        const isJustDropped = () => justDroppedId() === item.story.id;
                        const canDrag = !item.isRecurring;

                        return (
                          <div
                            draggable={canDrag}
                            onDragStart={(e) => handleDragStart(e, item.story, dateKey)}
                            onDragEnd={handleDragEnd}
                            onClick={(e) => { e.stopPropagation(); setSelectedStoryForDetail(item.story); }}
                            class={`w-full text-left px-1.5 py-1 rounded-md border text-[10px] font-medium leading-tight truncate transition-all group/item flex items-center gap-1 ${
                               item.isCompleted ? 'opacity-50 line-through bg-base-content/5 border-transparent text-base-content/40' : styleDesc
                            } ${
                               canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                            } ${
                               isDragging() ? 'opacity-40 scale-95' : ''
                            } ${
                               isJustDropped() ? 'animate-story-drop' : ''
                            }`}
                          >
                            <Show when={item.isRecurring} fallback={
                              <button
                                onClick={(e) => { e.stopPropagation(); markStoryDone(item.story.id); }}
                                class="shrink-0 transition-all opacity-0 group-hover/item:opacity-100 absolute -ml-5 p-1"
                              >
                                <CheckCircle2 size={12} class="text-ios-green-500 hover:text-ios-green-400" />
                              </button>
                            }>
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleCompletion(item.story.id, dateKey, item.isCompleted); }}
                                class="shrink-0 transition-transform active:scale-90"
                              >
                                <Show when={item.isCompleted} fallback={<Circle size={10} class="text-current opacity-50" />}>
                                  <CheckCircle2 size={10} class="text-ios-green-500" />
                                </Show>
                              </button>
                            </Show>
                            
                            <span class="truncate pr-1 flex-1">
                              <Show when={getStartTime(item.story)}>
                                <span class="font-bold opacity-80 mr-1">{formatTimeShort(getStartTime(item.story))}</span>
                              </Show>
                              {item.story.title}
                            </span>
                          </div>
                        )
                      }}
                    </For>
                    <Show when={items().length > (view() === 'month' ? 4 : 99)}>
                      <div class="text-[9px] font-bold text-base-content/30 hover:text-base-content/50 pl-1">
                        + {items().length - 4} más...
                      </div>
                    </Show>
                  </div>

                  {/* Tasks dots for mobile/small screens */}
                  <div class="flex sm:hidden flex-wrap items-center gap-0.5 px-1 mt-1">
                     <For each={items().slice(0, 5)}>
                       {(item) => (
                         <div class={`w-1.5 h-1.5 rounded-full ${item.isCompleted ? 'bg-base-content/20' : 'bg-ios-blue-500'}`} />
                       )}
                     </For>
                     <Show when={items().length > 5}>
                       <span class="text-[8px] font-bold text-base-content/40">+</span>
                     </Show>
                  </div>

                      </div>
                    );
                  }}
                </For>
              </div>
              );
            }}
          </For>
        </div>
      </div>
      </Show>

      {/* ── Week / Day Timeline View (Apple Calendar-style) ── */}
      <Show when={view() === 'week' || view() === 'day'}>
        {(() => {
          const v = () => view();
          const days = createMemo<Date[]>(() => v() === 'week' ? buildWeek(baseDate()) : [(() => { const d = new Date(baseDate()); d.setHours(0,0,0,0); return d; })()]);

          // Split items into all-day + timed for each visible day
          const dayItems = createMemo(() => {
            const map = new Map<string, {
              allDay: { story: Story; isRecurring: boolean; isCompleted: boolean }[];
              timed: { story: Story; isRecurring: boolean; isCompleted: boolean; start: number; end: number; startStr: string; endStr: string }[];
            }>();
            const byDate = itemsByDate();
            for (const d of days()) {
              const key = toLocalDateStr(d);
              const all = byDate.get(key) ?? [];
              const allDay: any[] = [];
              const timed: any[] = [];
              for (const it of all) {
                const startStr = getStartTime(it.story);
                if (!startStr) {
                  allDay.push(it);
                  continue;
                }
                const sp = parseHHmm(startStr);
                if (!sp) { allDay.push(it); continue; }
                const startMin = sp.h * 60 + sp.m;
                const endStr = getEndTime(it.story) ?? (() => {
                  // default to start + 60min when no explicit end
                  const e = new Date(); e.setHours(sp.h, sp.m + 60, 0, 0);
                  return `${String(e.getHours()).padStart(2,'0')}:${String(e.getMinutes()).padStart(2,'0')}`;
                })();
                const ep = parseHHmm(endStr);
                const endMin = ep ? ep.h * 60 + ep.m : startMin + 60;
                timed.push({ ...it, start: startMin, end: Math.max(startMin + 15, endMin), startStr, endStr });
              }
              map.set(key, { allDay, timed });
            }
            return map;
          });

          // For all-day band height: max #items across visible days
          const allDayRows = createMemo(() => {
            let max = 0;
            for (const { allDay } of dayItems().values()) max = Math.max(max, allDay.length);
            return max;
          });

          return (
            <div class="flex-1 bg-base-200/30 rounded-2xl border border-base-content/[0.08] overflow-hidden flex flex-col shadow-sm">

              {/* Day Header strip */}
              <div
                class="grid border-b border-base-content/[0.08] bg-base-100/50 backdrop-blur-md"
                style={{ 'grid-template-columns': `${TIME_GUTTER_WIDTH}px repeat(${days().length}, minmax(0, 1fr))` }}
              >
                <div class="py-3 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-base-content/30 bg-base-content/[0.012] border-r border-base-content/[0.045] flex flex-col items-center justify-center">
                  <Clock size={12} class="opacity-50" />
                </div>
                <For each={days()}>
                  {(d) => {
                    const isToday = isSameDay(d, today);
                    const weekday = DAY_NAMES_SHORT[(d.getDay() + 6) % 7];
                    return (
                      <button
                        type="button"
                        onClick={() => { setBaseDate(d); setView('day'); }}
                        class="py-2 flex flex-col items-center justify-center gap-0.5 border-r border-base-content/[0.045] last:border-r-0 hover:bg-base-content/[0.02] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ios-blue-500/40"
                      >
                        <span class="text-[10px] font-bold uppercase tracking-widest text-base-content/40">{weekday}</span>
                        <span class={`inline-flex h-7 min-w-7 items-center justify-center rounded-full text-[13px] font-bold transition-all px-2 ${
                          isToday ? 'bg-ios-blue-500 text-white shadow-sm' : 'text-base-content/70'
                        }`}>
                          {d.getDate()}
                        </span>
                      </button>
                    );
                  }}
                </For>
              </div>

              {/* All-day band (only if at least 1 day has all-day items) */}
              <Show when={allDayRows() > 0}>
                <div
                  class="grid border-b border-base-content/[0.08] bg-base-100/30"
                  style={{ 'grid-template-columns': `${TIME_GUTTER_WIDTH}px repeat(${days().length}, minmax(0, 1fr))` }}
                >
                  <div class="px-2 py-2 border-r border-base-content/[0.045] flex items-start justify-end">
                    <span class="text-[9px] font-bold uppercase tracking-[0.12em] text-base-content/40 mt-0.5">Todo el día</span>
                  </div>
                  <For each={days()}>
                    {(d) => {
                      const key = toLocalDateStr(d);
                      const isDropHover = () => dragHoverKey() === key;
                      return (
                        <div
                          onDragOver={(e) => handleDragOverCell(e, key)}
                          onDragLeave={() => handleDragLeaveCell(key)}
                          onDrop={(e) => handleDropCell(e, key)}
                          class={`border-r border-base-content/[0.045] last:border-r-0 px-1.5 py-1.5 flex flex-col gap-1 min-h-[44px] transition-colors ${
                            isDropHover() ? 'bg-ios-blue-500/10 ring-2 ring-inset ring-ios-blue-500/40' : ''
                          }`}
                        >
                          <For each={dayItems().get(key)?.allDay ?? []}>
                            {(item) => {
                              const styleDesc = priorityColor[item.story.priority] || priorityColor.low;
                              const isDragging = () => draggingId() === item.story.id;
                              const isJustDropped = () => justDroppedId() === item.story.id;
                              const canDrag = !item.isRecurring;
                              return (
                                <div
                                  draggable={canDrag}
                                  onDragStart={(e) => handleDragStart(e, item.story, key)}
                                  onDragEnd={handleDragEnd}
                                  onClick={(e) => { e.stopPropagation(); setSelectedStoryForDetail(item.story); }}
                                  class={`group/item flex items-center gap-1 w-full text-left px-1.5 py-1 rounded-md border text-[10px] font-semibold leading-tight truncate transition-all ${
                                    item.isCompleted ? 'opacity-50 line-through bg-base-content/5 border-transparent text-base-content/40' : styleDesc
                                  } ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
                                    isDragging() ? 'opacity-40 scale-95' : ''
                                  } ${isJustDropped() ? 'animate-story-drop' : ''}`}
                                >
                                  <Show when={!item.isRecurring} fallback={
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleCompletion(item.story.id, key, item.isCompleted); }}
                                      class="shrink-0 transition-transform active:scale-90"
                                    >
                                      <Show when={item.isCompleted} fallback={<Circle size={10} class="text-current opacity-50" />}>
                                        <CheckCircle2 size={10} class="text-ios-green-500" />
                                      </Show>
                                    </button>
                                  }>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); markStoryDone(item.story.id); }}
                                      class="shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                      title="Marcar como hecha"
                                    >
                                      <CheckCircle2 size={10} class="text-ios-green-500" />
                                    </button>
                                  </Show>
                                  <span class="truncate flex-1">{item.story.title}</span>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>

              {/* Timeline body (scrollable) */}
              <div class="flex-1 overflow-y-auto">
                <div
                  class="relative grid"
                  style={{
                    'grid-template-columns': `${TIME_GUTTER_WIDTH}px repeat(${days().length}, minmax(0, 1fr))`,
                    height: `${TIMELINE_HEIGHT}px`,
                  }}
                >
                  {/* Hour labels column */}
                  <div class="relative border-r border-base-content/[0.045] bg-base-content/[0.012]">
                    <For each={HOURS_RANGE}>
                      {(h, i) => (
                        <div
                          class="absolute right-2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-base-content/35 tabular-nums"
                          style={{ top: `${i() * HOUR_HEIGHT}px` }}
                        >
                          {/* Hide the very first label so it doesn't clip at the top edge */}
                          <Show when={i() > 0}>{formatHourLabel(h)}</Show>
                        </div>
                      )}
                    </For>
                  </div>

                  {/* Day columns */}
                  <For each={days()}>
                    {(d) => {
                      const key = toLocalDateStr(d);
                      const isToday = isSameDay(d, today);
                      const timed = () => dayItems().get(key)?.timed ?? [];
                      const stackDepth = createMemo(() => computeStackDepth(timed()));
                      const isDropHover = () => dragHoverKey() === key;
                      const hint = () => {
                        const h = dropTimeHint();
                        return h && h.dateKey === key ? h : null;
                      };
                      return (
                        <div
                          onDragOver={(e) => handleDragOverTimeline(e, key)}
                          onDragLeave={() => handleDragLeaveCell(key)}
                          onDrop={(e) => handleDropOnTimelineCell(e, key)}
                          onClick={(e) => {
                            // Click empty area: quick-add at the clicked hour (timeline grants hour resolution).
                            if (e.target === e.currentTarget) {
                              const range = timelineClickToTimeRange(e);
                              if (range) openQuickAdd(e, key, range.startTime, range.endTime);
                            }
                          }}
                          class={`relative border-r border-base-content/[0.045] last:border-r-0 transition-colors ${
                            isDropHover() ? 'bg-ios-blue-500/[0.06]' : ''
                          }`}
                        >
                          {/* Hour gridlines */}
                          <For each={HOURS_RANGE}>
                            {(_, i) => (
                              <div
                                class={`pointer-events-none absolute left-0 right-0 ${i() === 0 ? '' : 'border-t'} border-base-content/[0.05]`}
                                style={{ top: `${i() * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                              >
                                {/* Half-hour subtle marker */}
                                <div class="absolute left-0 right-0 border-t border-dashed border-base-content/[0.025]" style={{ top: `${HOUR_HEIGHT / 2}px` }} />
                              </div>
                            )}
                          </For>

                          {/* Today subtle column tint */}
                          <Show when={isToday}>
                            <div class="pointer-events-none absolute inset-0 bg-ios-blue-500/[0.025]" />
                          </Show>

                          {/* Now indicator */}
                          <Show when={isToday && nowVisible()}>
                            <div
                              class="pointer-events-none absolute left-0 right-0 z-20"
                              style={{ top: `${nowTopPx()}px` }}
                            >
                              <div class="relative">
                                <div class="absolute -left-1 -top-[5px] w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.18)]" />
                                <div class="h-[2px] bg-red-500" />
                              </div>
                            </div>
                          </Show>

                          {/* Drop-time hint while dragging over this column */}
                          <Show when={hint()}>
                            {(h) => (
                              <div
                                class="pointer-events-none absolute left-0 right-0 z-30"
                                style={{ top: `${h().topPx}px` }}
                              >
                                <div class="relative h-0">
                                  <div class="h-[2px] bg-ios-blue-500/80 shadow-[0_0_0_2px_rgba(0,122,255,0.18)]" />
                                  <span class="absolute -top-[18px] right-1 rounded-md bg-ios-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums shadow-[0_2px_6px_rgba(0,0,0,0.18)]">
                                    {formatTimeShort(h().startTimeStr)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </Show>

                          {/* Timed events */}
                          <For each={timed()}>
                            {(item) => {
                              const depth = () => stackDepth().get(item) ?? 0;
                              const top = topPx(item.startStr);
                              const isResizingThis = () => resizing()?.storyId === item.story.id;
                              const effectiveEndStr = () => {
                                const r = resizing();
                                return r && r.storyId === item.story.id ? r.currentEndTimeStr : item.endStr;
                              };
                              const height = () => heightPx(item.startStr, effectiveEndStr());
                              const styleDesc = priorityColor[item.story.priority] || priorityColor.low;
                              const isDragging = () => draggingId() === item.story.id;
                              const isJustDropped = () => justDroppedId() === item.story.id;
                              const canDrag = !item.isRecurring;
                              const canResize = () => !item.isRecurring && !!item.endStr;
                              return (
                                <div
                                  draggable={canDrag && !isResizingThis()}
                                  onDragStart={(e) => handleDragStart(e, item.story, key)}
                                  onDragEnd={handleDragEnd}
                                  onClick={(e) => { e.stopPropagation(); if (!isResizingThis()) setSelectedStoryForDetail(item.story); }}
                                  class={`group/event absolute rounded-md border px-1.5 py-1 text-[11px] font-semibold leading-tight overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-[opacity,transform,box-shadow] ${
                                    item.isCompleted ? 'opacity-50 line-through bg-base-content/5 border-transparent text-base-content/40' : styleDesc
                                  } ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
                                    isDragging() ? 'opacity-40 scale-95' : ''
                                  } ${isJustDropped() ? 'animate-story-drop' : ''} ${
                                    isResizingThis() ? 'ring-2 ring-ios-blue-500/50 shadow-[0_4px_14px_rgba(0,122,255,0.18)]' : ''
                                  } ${depth() > 0 ? 'ring-1 ring-base-100/60 shadow-[0_2px_8px_rgba(0,0,0,0.18)]' : ''}`}
                                  style={{
                                    top: `${top}px`,
                                    height: `${height()}px`,
                                    left: `${depth() * STACK_OFFSET_PX + 2}px`,
                                    right: '2px',
                                    'z-index': 10 + depth(),
                                  }}
                                  title={`${item.story.title} (${formatTimeShort(item.startStr)}${effectiveEndStr() ? ' – ' + formatTimeShort(effectiveEndStr()) : ''})`}
                                >
                                  <div class="flex items-center gap-1 truncate">
                                    <Show when={!item.isRecurring} fallback={
                                      <button
                                        onClick={(e) => { e.stopPropagation(); toggleCompletion(item.story.id, key, item.isCompleted); }}
                                        class="shrink-0 transition-transform active:scale-90"
                                      >
                                        <Show when={item.isCompleted} fallback={<Circle size={10} class="text-current opacity-50" />}>
                                          <CheckCircle2 size={10} class="text-ios-green-500" />
                                        </Show>
                                      </button>
                                    }>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); markStoryDone(item.story.id); }}
                                        class="shrink-0 opacity-0 group-hover/event:opacity-100 transition-opacity"
                                      >
                                        <CheckCircle2 size={10} class="text-ios-green-500" />
                                      </button>
                                    </Show>
                                    <span class="truncate">{item.story.title}</span>
                                  </div>
                                  <Show when={height() >= 32}>
                                    <div class="text-[10px] font-medium opacity-70 mt-0.5 tabular-nums">
                                      {formatTimeShort(item.startStr)}{effectiveEndStr() ? ` – ${formatTimeShort(effectiveEndStr())}` : ''}
                                    </div>
                                  </Show>
                                  {/* Drag handle hint — top edge. Visible on hover, signals
                                      the prioritized grab area (especially when another event
                                      stacks above and covers most of the body). */}
                                  <Show when={canDrag}>
                                    <div
                                      class="pointer-events-none absolute top-0 left-0 right-0 h-3 flex items-start justify-center pt-[3px] opacity-0 group-hover/event:opacity-100 transition-opacity"
                                      aria-hidden="true"
                                    >
                                      <div class="h-[3px] w-7 rounded-full bg-current/40" />
                                    </div>
                                  </Show>
                                  {/* Resize handle — bottom edge. Visible on hover or while resizing. */}
                                  <Show when={canResize()}>
                                    <div
                                      onMouseDown={(e) => startResize(e, item.story)}
                                      class={`absolute bottom-0 left-0 right-0 h-2.5 cursor-ns-resize transition-opacity flex items-end justify-center pb-[2px] ${
                                        isResizingThis() ? 'opacity-100' : 'opacity-0 group-hover/event:opacity-100'
                                      }`}
                                      aria-label="Arrastrar para cambiar la duración"
                                      title="Arrastrar para cambiar la duración"
                                    >
                                      <div class="h-[3px] w-7 rounded-full bg-current/40" />
                                    </div>
                                  </Show>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </div>
          );
        })()}
      </Show>

      {/* ── Selected Day Detail Panel (mostly useful for smaller screens or week view details) ── */}
      <div class="mt-4 bg-base-200/30 rounded-2xl border border-base-content/[0.08] p-5 pb-8 sm:hidden">
         <div class="flex items-center justify-between mb-4">
           <h2 class="text-sm font-bold text-base-content/80">
             {selectedDay() && selectedDay().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
           </h2>
           <button 
             onClick={(e) => handleQuickAddClick(e, selectedDay()!)}
             class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ios-blue-500 text-white text-[11px] font-bold shadow-sm active:scale-95 transition-transform"
           >
             <Plus size={12} strokeWidth={2.5} />
             Crear
           </button>
         </div>
         <div class="space-y-2">
            <For each={itemsByDate().get(toLocalDateStr(selectedDay())) ?? []} fallback={
              <div class="text-[12px] text-base-content/40 text-center py-4 border border-dashed border-base-content/10 rounded-xl">
                 No hay tareas para este día
              </div>
            }>
              {(item) => (
                <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-base-content/[0.04] bg-base-100/50">
                  <span class={`text-[12px] font-medium ${item.isCompleted ? 'line-through text-base-content/30' : 'text-base-content/80'}`}>
                    {item.story.title}
                  </span>
                </div>
              )}
            </For>
         </div>
      </div>

      {/* ── Desktop/Global Day Modal ── */}
      <Show when={showDayModal()}>
        <div class="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowDayModal(false)}>
          <div class="bg-base-100 rounded-[24px] shadow-2xl shadow-black/20 w-full max-w-sm overflow-hidden flex flex-col border border-base-content/[0.08] animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <div class="px-5 py-4 border-b border-base-content/[0.06] flex items-center justify-between bg-base-content/[0.02]">
              <div>
                <h2 class="text-[18px] font-bold text-base-content/90">
                  {selectedDay().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h2>
              </div>
              <button onClick={() => setShowDayModal(false)} class="p-1.5 rounded-full hover:bg-base-content/10 transition-colors text-base-content/50">
                <X size={18} />
              </button>
            </div>
            
            <div class="p-4 overflow-y-auto max-h-[50vh] space-y-2">
              <For each={itemsByDate().get(toLocalDateStr(selectedDay())) ?? []} fallback={
                <div class="text-[12px] text-base-content/40 text-center py-6">
                   Día libre. No hay tareas programadas.
                </div>
              }>
                {(item) => (
                  <button 
                    onClick={() => { setSelectedStoryForDetail(item.story); }}
                    class="w-full text-left flex items-start gap-3 px-3 py-3 rounded-xl border border-base-content/[0.06] bg-base-100 hover:bg-base-content/[0.02] active:bg-base-content/[0.04] transition-all group"
                  >
                    <div class="mt-0.5 shrink-0" onClick={(e) => { e.stopPropagation(); toggleCompletion(item.story.id, toLocalDateStr(selectedDay()), item.isCompleted); }}>
                       <Show when={item.isCompleted} fallback={<Circle size={16} class="text-base-content/20 group-hover:text-base-content/40 transition-colors" />}>
                         <CheckCircle2 size={16} class="text-ios-green-500" />
                       </Show>
                    </div>
                    <span class={`text-[13px] font-medium leading-tight flex-1 ${item.isCompleted ? 'line-through text-base-content/30' : 'text-base-content/80'}`}>
                      {item.story.title}
                    </span>
                  </button>
                )}
              </For>
            </div>

            <div class="p-4 border-t border-base-content/[0.06] bg-base-content/[0.02]">
              <button 
                onClick={(e) => handleQuickAddClick(e, selectedDay())}
                class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-base-content/5 hover:bg-base-content/10 text-base-content/80 text-[13px] font-bold transition-all active:scale-[0.98]"
              >
                <Plus size={16} strokeWidth={2.5} />
                Agregar nueva tarea
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* ── Lateral Story Detail ── */}
      <Show when={selectedStoryForDetail()}>
        <StoryDetail
          story={selectedStoryForDetail()!}
          onClose={() => setSelectedStoryForDetail(null)}
          zIndex={200}
          onDeleted={() => {
            mutateStories(prev => (prev ?? []).filter(s => s.id !== selectedStoryForDetail()!.id));
            setSelectedStoryForDetail(null);
          }}
          onUpdated={(id, fields) => {
            mutateStories(prev => {
              if (fields.is_active === false) {
                return (prev ?? []).filter(s => s.id !== id);
              }
              return (prev ?? []).map(s => s.id === id ? { ...s, ...fields } as Story : s);
            });
          }}
        />
      </Show>

      {/* QuickAdd popover — Google Calendar-style, anchored to the click point */}
      <Show when={quickAdd()}>
        {(state) => {
          // Compute viewport-safe popover position (default 320×170 ish).
          const POPOVER_W = 320;
          const POPOVER_H = 200;
          const left = () => {
            const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
            return Math.min(Math.max(8, state().anchorX - 20), vw - POPOVER_W - 8);
          };
          const top = () => {
            const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
            // Prefer below the click; flip above if it would overflow.
            const below = state().anchorY + 12;
            return below + POPOVER_H + 8 > vh ? Math.max(8, state().anchorY - POPOVER_H - 12) : below;
          };
          const dateLabel = () => {
            const [y, m, d] = state().dateKey.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            return dt.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
          };
          const timeLabel = () => {
            if (!state().startTime || !state().endTime) return 'Todo el día';
            return `${formatTimeShort(state().startTime)} – ${formatTimeShort(state().endTime)}`;
          };
          return (
            <>
              <div class="fixed inset-0 z-[60]" onMouseDown={closeQuickAdd} />
              <div
                class="fixed z-[61] w-[320px] rounded-2xl border border-base-content/[0.08] bg-base-100/98 shadow-[0_20px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl"
                style={{ left: `${left()}px`, top: `${top()}px` }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div class="flex items-center justify-between px-4 pt-3 pb-2">
                  <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/40">Nuevo</span>
                  <button
                    type="button"
                    onClick={closeQuickAdd}
                    aria-label="Cerrar"
                    class="text-base-content/35 hover:text-base-content/70 transition-colors p-1 -m-1 rounded"
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
                <div class="px-4">
                  <input
                    ref={quickAddInputRef}
                    type="text"
                    value={quickAddTitle()}
                    onInput={(e) => setQuickAddTitle(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submitQuickAdd(); }
                      if (e.key === 'Escape') { e.preventDefault(); closeQuickAdd(); }
                    }}
                    placeholder="Añade un título"
                    class="w-full bg-transparent border-b-2 border-base-content/[0.08] focus:border-ios-blue-500 px-0 py-2 text-[17px] font-semibold text-base-content placeholder:text-base-content/30 outline-none transition-colors"
                  />
                </div>
                <div class="px-4 pt-3 flex items-start gap-2 text-[12px] text-base-content/55">
                  <Clock size={13} class="mt-[2px] shrink-0 text-base-content/35" />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium capitalize">{dateLabel()}</div>
                    <div class="text-[11px] text-base-content/40 tabular-nums">{timeLabel()}</div>
                  </div>
                </div>
                <Show when={quickAddError()}>
                  <div class="mx-4 mt-3 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] font-medium text-red-400">
                    {quickAddError()}
                  </div>
                </Show>
                <div class="px-4 pt-3 pb-3 mt-2 flex items-center justify-between gap-2 border-t border-base-content/[0.05]">
                  <button
                    type="button"
                    onClick={openQuickAddMoreOptions}
                    class="text-[12px] font-semibold text-ios-blue-500 hover:text-ios-blue-600 transition-colors"
                  >
                    Más opciones
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitQuickAdd()}
                    disabled={!quickAddTitle().trim() || quickAddSubmitting()}
                    class="rounded-full bg-ios-blue-500 px-4 py-1.5 text-[12px] font-bold text-white shadow-sm hover:bg-ios-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                  >
                    {quickAddSubmitting() ? 'Creando…' : 'Crear'}
                  </button>
                </div>
              </div>
            </>
          );
        }}
      </Show>

      </div>
    </>
  );
};

export default CalendarPage;
