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
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, CheckCircle2, Circle, X } from 'lucide-solid';
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

const CalendarPage: Component<Props> = (props) => {
  const auth = useAuth();
  const data = useData();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentWeekStart = buildWeek(today)[0];

  const [view, setView] = createSignal<'month' | 'week'>('month');
  const [baseDate, setBaseDate] = createSignal(today);
  const [selectedDay, setSelectedDay] = createSignal<Date>(today);
  const [showDayModal, setShowDayModal] = createSignal(false);
  const [selectedStoryForDetail, setSelectedStoryForDetail] = createSignal<Story | null>(null);

  const userId = () => auth.user()?.id ?? '';

  const [selectedUserIds, setSelectedUserIds] = createSignal<string[]>([]);
  const [filterInitialized, setFilterInitialized] = createSignal(false);

  createEffect(() => {
    const uid = userId();
    if (uid && !filterInitialized()) {
      setSelectedUserIds([uid]);
      setFilterInitialized(true);
    }
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
    return view() === 'month' ? buildMonth(baseDate()) : buildWeek(baseDate());
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
    if (view() === 'month') d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setBaseDate(d);
  };

  const goNext = () => {
    const d = new Date(baseDate());
    if (view() === 'month') d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
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
    if (view() === 'month') {
      const m = baseDate().getMonth();
      const y = baseDate().getFullYear();
      return `${MONTH_NAMES[m].charAt(0).toUpperCase() + MONTH_NAMES[m].slice(1)} ${y}`;
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

  const handleQuickAddClick = (e: MouseEvent, d: Date) => {
    e.stopPropagation();
    props.onRequestQuickAdd?.(toLocalDateStr(d));
    setShowDayModal(false); // Close day modal if opening quick add
  };

  const toggleUserFilter = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const clearUserFilter = () => setSelectedUserIds([]);

  const activeTeam = () => data.users().filter((u) => u.is_active);

  // ── Drag & drop ───────────────────────────────────────────
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dragHoverKey, setDragHoverKey] = createSignal<string | null>(null);
  const [justDroppedId, setJustDroppedId] = createSignal<string | null>(null);

  const handleDragStart = (
    e: DragEvent,
    story: Story,
    sourceKey: string,
  ) => {
    if (isRecurring(story) || !e.dataTransfer) return;
    const field: 'scheduled_date' | 'due_date' = story.scheduled_date ? 'scheduled_date' : 'due_date';
    const payload = JSON.stringify({ id: story.id, from: sourceKey, field });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-daily-story', payload);
    e.dataTransfer.setData('text/plain', payload);
    setDraggingId(story.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragHoverKey(null);
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

  const handleDropCell = async (e: DragEvent, targetKey: string) => {
    e.preventDefault();
    setDragHoverKey(null);
    setDraggingId(null);

    const raw = e.dataTransfer?.getData('application/x-daily-story')
      ?? e.dataTransfer?.getData('text/plain');
    if (!raw) return;
    let payload: { id: string; from: string; field: 'scheduled_date' | 'due_date' };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (payload.from === targetKey) return;

    const current = (stories() ?? []).find((s) => s.id === payload.id);
    if (!current || isRecurring(current)) return;

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
      // rollback
      mutateStories((prev) =>
        (prev ?? []).map((s) => (s.id === payload.id ? { ...s, ...previous } : s)) as any,
      );
    }
  };

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
          <div class="relative grid h-9 w-[168px] grid-cols-2 items-center rounded-[18px] border border-base-content/[0.055] bg-base-content/[0.025] p-1 shrink-0">
            <div
              aria-hidden="true"
              class="absolute left-1 top-1 h-7 rounded-[14px] border border-base-content/[0.045] bg-base-100/95 shadow-[0_1px_6px_rgba(15,23,42,0.08)] transition-transform duration-200 ease-out"
              style={{
                width: 'calc((100% - 8px) / 2)',
                transform: view() === 'month' ? 'translateX(100%)' : 'translateX(0)',
              }}
            />
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

      {/* ── Grid ── */}
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
                        onClick={() => handleCellClick(d)}
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
                            
                            <span class="truncate pr-1 flex-1">{item.story.title}</span>
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

      </div>
    </>
  );
};

export default CalendarPage;
