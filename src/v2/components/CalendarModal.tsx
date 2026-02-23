import { createSignal, createResource, onCleanup, For, Show, type Component } from 'solid-js';
import type { Story } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { X, Calendar, ChevronRight } from 'lucide-solid';
import StoryDetail from './StoryDetail';

// ─── Helpers ────────────────────────────────────

const DAY_NAMES_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const toDateKey = (d: Date) => d.toISOString().split('T')[0];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const buildWeek = (): Date[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
};

const dayLabel = (d: Date) => {
  const jsDay = d.getDay();
  const idx = jsDay === 0 ? 6 : jsDay - 1;
  return DAY_NAMES_SHORT[idx];
};

const priorityColor: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-ios-blue-500',
  low: 'bg-base-content/30',
};

const statusLabel: Record<string, { text: string; color: string }> = {
  backlog: { text: 'Backlog', color: 'text-base-content/30' },
  todo: { text: 'Por hacer', color: 'text-ios-blue-500' },
  in_progress: { text: 'En progreso', color: 'text-amber-500' },
  done: { text: 'Hecho', color: 'text-ios-green-500' },
};

// ─── Component ──────────────────────────────────

interface Props {
  onClose: () => void;
}

const CalendarModal: Component<Props> = (props) => {
  const auth = useAuth();
  const data = useData();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const week = buildWeek();
  const [selectedDay, setSelectedDay] = createSignal<Date>(today);
  const [detailStory, setDetailStory] = createSignal<Story | null>(null);
  const [isDetailExiting, setIsDetailExiting] = createSignal(false);

  const userId = () => auth.user()?.id ?? '';

  const [stories] = createResource(userId, async (uid) => {
    if (!uid) return [];
    const list = await api.stories.list({ assignee_id: uid });
    return list as Story[];
  });

  const storiesByDate = () => {
    const all = stories() ?? [];
    const map = new Map<string, Story[]>();

    for (const s of all) {
      if (s.status === 'done') continue;
      const dateStr = s.due_date ?? s.scheduled_date;
      if (!dateStr) continue;
      const key = dateStr.split('T')[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }

    const priorityWeight: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    for (const arr of map.values()) {
      arr.sort((a, b) => (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9));
    }
    return map;
  };

  const countForDate = (d: Date) => storiesByDate().get(toDateKey(d))?.length ?? 0;

  const selectedStories = () => storiesByDate().get(toDateKey(selectedDay())) ?? [];

  const undatedStories = () => {
    const all = stories() ?? [];
    return all.filter(s => s.status !== 'done' && !s.due_date && !s.scheduled_date);
  };

  // Close on Escape — if detail is open close it first, otherwise close calendar
  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (detailStory()) {
        closeDetail();
      } else {
        props.onClose();
      }
    }
  };
  document.addEventListener('keydown', handleKey);
  onCleanup(() => document.removeEventListener('keydown', handleKey));

  const formatHeader = () => {
    const d = today;
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}. ${d.getFullYear()}`;
  };

  /** Animated close for StoryDetail — fade out then unmount. */
  const closeDetail = () => {
    setIsDetailExiting(true);
    setTimeout(() => {
      setDetailStory(null);
      setIsDetailExiting(false);
    }, 250);
  };

  const hasDetail = () => detailStory() !== null;

  return (
    <>
      {/* ── Calendar backdrop + panel ── */}
      <div
        class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-end sm:items-start sm:justify-center sm:pt-[12vh] animate-in fade-in duration-200"
        onClick={() => {
          if (hasDetail()) { closeDetail(); } else { props.onClose(); }
        }}
      >
        {/* Calendar card — scales back subtly when detail is open */}
        <div
          class="w-full sm:max-w-md bg-base-100 rounded-t-[24px] sm:rounded-[24px] shadow-2xl shadow-black/50 border border-base-content/[0.06] overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300"
          style={{
            transform: hasDetail() ? 'scale(0.97) translateY(6px)' : 'scale(1) translateY(0)',
            opacity: hasDetail() ? '0.6' : '1',
            filter: hasDetail() ? 'blur(1px)' : 'none',
            transition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1), opacity 0.3s ease, filter 0.3s ease',
            "pointer-events": hasDetail() ? 'none' : 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div class="relative px-6 pt-5 pb-3">
            <button
              onClick={props.onClose}
              class="absolute top-4 right-4 p-1.5 rounded-full text-base-content/30 hover:text-base-content/60 hover:bg-base-content/5 transition-all"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
            <p class="text-center text-lg font-bold tracking-tight text-base-content/90">
              {formatHeader()}
            </p>
          </div>

          {/* ── Week strip ── */}
          <div class="px-4 pb-4">
            <div class="flex items-end justify-between px-2">
              <For each={week}>
                {(d) => {
                  const isToday = isSameDay(d, today);
                  const isSelected = () => isSameDay(d, selectedDay());
                  const count = () => countForDate(d);

                  return (
                    <button
                      onClick={() => setSelectedDay(d)}
                      class="flex flex-col items-center gap-1 py-1 px-1 sm:px-2 group transition-all"
                    >
                      <span class={`text-[11px] font-bold uppercase tracking-wider ${isToday ? 'text-red-500' : 'text-base-content/35'}`}>
                        {dayLabel(d)}
                      </span>
                      <div class={`w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-bold transition-all duration-200 ${
                        isSelected()
                          ? 'bg-ios-blue-500 text-white shadow-lg shadow-ios-blue-500/30'
                          : isToday
                            ? 'text-red-500'
                            : 'text-base-content/70 group-hover:bg-base-content/5'
                      }`}>
                        {d.getDate()}
                      </div>
                      <div class="flex items-center gap-0.5 h-2">
                        <Show when={count() > 0}>
                          <For each={Array.from({ length: Math.min(count(), 3) })}>
                            {() => (
                              <div class={`w-1 h-1 rounded-full ${isToday && !isSelected() ? 'bg-base-content/40' : 'bg-ios-blue-500'}`} />
                            )}
                          </For>
                          <Show when={count() > 3}>
                            <span class="text-[8px] font-bold text-ios-blue-500 ml-0.5">+</span>
                          </Show>
                        </Show>
                      </div>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>

          <div class="h-px bg-base-content/[0.06]" />

          {/* ── Story list ── */}
          <div class="max-h-[45vh] overflow-y-auto">
            <Show when={stories.loading}>
              <div class="px-6 py-8 text-center">
                <div class="w-5 h-5 border-2 border-ios-blue-500/30 border-t-ios-blue-500 rounded-full animate-spin mx-auto" />
                <p class="text-[12px] font-bold text-base-content/30 mt-3 tracking-wide">Cargando HUs...</p>
              </div>
            </Show>

            <Show when={!stories.loading}>
              <div class="px-6 pt-4 pb-2 flex items-center gap-2">
                <Calendar size={14} class="text-base-content/30" />
                <span class="text-[12px] font-bold text-base-content/40 uppercase tracking-widest">
                  {isSameDay(selectedDay(), today) ? 'Hoy' : dayLabel(selectedDay())} — {selectedDay().getDate()} {MONTH_NAMES[selectedDay().getMonth()]}
                </span>
                <Show when={selectedStories().length > 0}>
                  <span class="text-[10px] font-bold bg-ios-blue-500/10 text-ios-blue-500 px-1.5 py-0.5 rounded-md ml-auto">
                    {selectedStories().length}
                  </span>
                </Show>
              </div>

              <Show when={selectedStories().length > 0} fallback={
                <div class="px-6 py-6 text-center">
                  <p class="text-[13px] font-bold text-base-content/25">Sin HUs para este día</p>
                </div>
              }>
                <div class="px-3 pb-2">
                  <For each={selectedStories()}>
                    {(story) => {
                      const proj = story.project_id ? data.getProjectById(story.project_id) : null;
                      const st = statusLabel[story.status] ?? statusLabel.backlog;
                      const isOverdue = () => {
                        if (!story.due_date) return false;
                        return new Date(story.due_date) < today && story.status !== 'done';
                      };

                      return (
                        <button
                          onClick={() => setDetailStory(story)}
                          class="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-base-content/[0.04] transition-all group text-left"
                        >
                          <div class={`w-2 h-2 rounded-full shrink-0 ${priorityColor[story.priority] ?? 'bg-base-content/20'}`} />
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                              <Show when={story.code}>
                                <span class="text-[10px] font-mono font-bold text-base-content/25 bg-base-content/[0.04] px-1.5 py-0.5 rounded shrink-0">
                                  {story.code}
                                </span>
                              </Show>
                              <span class="text-[13px] font-bold truncate text-base-content/80 group-hover:text-base-content transition-colors">
                                {story.title}
                              </span>
                            </div>
                            <div class="flex items-center gap-2 mt-0.5">
                              <span class={`text-[10px] font-bold ${st.color}`}>{st.text}</span>
                              <Show when={isOverdue()}>
                                <span class="text-[10px] font-bold text-red-500">Vencida</span>
                              </Show>
                              <Show when={story.due_date}>
                                <span class="text-[10px] font-medium text-base-content/25">
                                  vence {new Date(story.due_date!).getDate()} {MONTH_NAMES[new Date(story.due_date!).getMonth()]}
                                </span>
                              </Show>
                            </div>
                          </div>
                          <Show when={proj}>
                            <span
                              class="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                              style={{ "background-color": `${proj!.color}15`, color: proj!.color }}
                            >
                              {proj!.prefix}
                            </span>
                          </Show>
                          <ChevronRight size={14} class="text-base-content/15 shrink-0 group-hover:text-base-content/40 transition-colors" />
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>

              <Show when={isSameDay(selectedDay(), today) && undatedStories().length > 0}>
                <div class="px-6 pt-3 pb-2 flex items-center gap-2">
                  <span class="text-[11px] font-bold text-base-content/25 uppercase tracking-widest">Sin fecha</span>
                  <span class="text-[10px] font-bold bg-base-content/5 text-base-content/30 px-1.5 py-0.5 rounded-md ml-auto">
                    {undatedStories().length}
                  </span>
                </div>
                <div class="px-3 pb-4">
                  <For each={undatedStories().slice(0, 5)}>
                    {(story) => {
                      const proj = story.project_id ? data.getProjectById(story.project_id) : null;
                      return (
                        <button
                          onClick={() => setDetailStory(story)}
                          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-base-content/[0.04] transition-all group text-left"
                        >
                          <div class={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityColor[story.priority] ?? 'bg-base-content/20'}`} />
                          <span class="text-[12px] font-bold truncate text-base-content/50 group-hover:text-base-content/70 transition-colors flex-1">
                            {story.code ? `${story.code} ` : ''}{story.title}
                          </span>
                          <Show when={proj}>
                            <span
                              class="text-[8px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                              style={{ "background-color": `${proj!.color}10`, color: `${proj!.color}90` }}
                            >
                              {proj!.prefix}
                            </span>
                          </Show>
                        </button>
                      );
                    }}
                  </For>
                  <Show when={undatedStories().length > 5}>
                    <p class="text-[11px] font-bold text-base-content/20 text-center py-2">
                      +{undatedStories().length - 5} más
                    </p>
                  </Show>
                </div>
              </Show>
            </Show>
          </div>

          {/* Footer */}
          <div class="h-px bg-base-content/[0.06]" />
          <div class="px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3 flex items-center justify-between">
            <span class="text-[10px] font-bold text-base-content/20 tracking-wide">
              HUs propias + asignadas
            </span>
            <kbd class="text-[10px] font-bold text-base-content/20 bg-base-content/[0.04] border border-base-content/[0.08] rounded-md px-2 py-0.5 font-mono">
              C
            </kbd>
          </div>
        </div>
      </div>

      {/* ── StoryDetail overlay — above calendar ── */}
      <Show when={detailStory()}>
        {(story) => (
          <StoryDetail
            story={story()}
            onClose={closeDetail}
            zIndex={210}
          />
        )}
      </Show>
    </>
  );
};

export default CalendarModal;
