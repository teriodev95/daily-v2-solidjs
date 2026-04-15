import { createEffect, createMemo, createResource, createSignal, For, Show, type Component } from 'solid-js';
import { CalendarDays, CheckCircle2, Circle, Loader2, RefreshCw } from 'lucide-solid';
import type { Story, StoryCompletion } from '../../types';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { isRecurring, isRecurringOnDate, toLocalDateStr } from '../../lib/recurrence';
import MobileStoryDetail from '../components/MobileStoryDetail';

interface MobileCalendarPageProps {
  refreshKey?: number;
  onRequestQuickAdd?: (date: string) => void;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const buildWindow = () => {
  const today = startOfDay(new Date());
  return Array.from({ length: 10 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() + index);
    return date;
  });
};

const MobileCalendarPage: Component<MobileCalendarPageProps> = (props) => {
  const auth = useAuth();
  const data = useData();
  const [selectedDay, setSelectedDay] = createSignal<Date>(buildWindow()[0]);
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);
  const [completingIds, setCompletingIds] = createSignal<Set<string>>(new Set());

  const days = buildWindow();
  const userId = () => auth.user()?.id ?? '';

  const [stories] = createResource(
    () => ({ uid: userId(), _r: props.refreshKey }),
    ({ uid }) => uid ? api.stories.list({ assignee_id: uid }) : Promise.resolve([]),
  );
  const [localStories, setLocalStories] = createSignal<Story[]>([]);

  createEffect(() => {
    const fetched = stories();
    if (fetched) setLocalStories(fetched as Story[]);
  });

  const [completions, { mutate: mutateCompletions }] = createResource(
    () => ({ uid: userId(), from: toLocalDateStr(days[0]), to: toLocalDateStr(days[days.length - 1]) }),
    ({ uid, from, to }) => uid ? api.completions.list(from, to) : Promise.resolve([]),
  );

  const completionSet = createMemo(() => {
    const set = new Set<string>();
    for (const completion of completions() ?? []) {
      set.add(`${completion.story_id}:${completion.completion_date}`);
    }
    return set;
  });

  const itemsByDay = createMemo(() => {
    const allStories = localStories();
    const map = new Map<string, Story[]>();

    for (const day of days) {
      const key = toLocalDateStr(day);
      const items: Story[] = [];

      for (const story of allStories) {
        if (isRecurring(story)) {
          if (story.status !== 'done' && isRecurringOnDate(story, day)) items.push(story);
          continue;
        }

        if (story.status === 'done') continue;
        const dateKey = story.scheduled_date?.split('T')[0] ?? story.due_date?.split('T')[0];
        if (dateKey === key) items.push(story);
      }

      if (items.length > 0) {
        items.sort((a, b) => a.title.localeCompare(b.title));
        map.set(key, items);
      }
    }

    return map;
  });

  const selectedItems = createMemo(() => itemsByDay().get(toLocalDateStr(selectedDay())) ?? []);

  const unscheduled = createMemo(() => localStories().filter(story =>
    story.status !== 'done' &&
    !isRecurring(story) &&
    !story.scheduled_date &&
    !story.due_date,
  ));

  const scheduledDaysCount = createMemo(() =>
    days.filter((day) => (itemsByDay().get(toLocalDateStr(day))?.length ?? 0) > 0).length,
  );

  const totalVisibleItems = createMemo(() =>
    Array.from(itemsByDay().values()).reduce((sum, items) => sum + items.length, 0),
  );

  const toggleRecurringCompletion = (story: Story, dateKey: string) => {
    const key = `${story.id}:${dateKey}`;
    if (completionSet().has(key)) {
      mutateCompletions(prev => (prev ?? []).filter(entry => !(entry.story_id === story.id && entry.completion_date === dateKey)));
      api.completions.delete(story.id, dateKey).catch(() => {});
      return;
    }

    const optimistic: StoryCompletion = {
      id: `temp-${Date.now()}`,
      story_id: story.id,
      user_id: userId(),
      completion_date: dateKey,
      created_at: new Date().toISOString(),
    };
    mutateCompletions(prev => [...(prev ?? []), optimistic]);
    api.completions.create(story.id, dateKey).catch(() => {});
  };

  const markStoryDone = async (story: Story) => {
    const previousStatus = story.status;
    const previousCompletedAt = story.completed_at;
    const completedAt = new Date().toISOString();
    setCompletingIds((prev) => new Set(prev).add(story.id));
    setLocalStories((prev) =>
      prev.map((item) => item.id === story.id ? { ...item, status: 'done' as Story['status'], completed_at: completedAt } : item),
    );
    try {
      await api.stories.update(story.id, { status: 'done', completed_at: completedAt });
    } catch {
      setLocalStories((prev) =>
        prev.map((item) => item.id === story.id ? { ...item, status: previousStatus, completed_at: previousCompletedAt } : item),
      );
    } finally {
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(story.id);
        return next;
      });
    }
  };

  const projectFor = (story: Story) => story.project_id ? data.getProjectById(story.project_id) : null;

  const relativeLabel = (date: Date) => {
    const diff = Math.round((startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    if (diff > 1 && diff < 7) return `En ${diff} días`;
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  const dayLoadLabel = (count: number) => {
    if (count === 0) return 'Libre';
    if (count === 1) return '1 tarea';
    return `${count} tareas`;
  };

  const selectedDaySubtitle = createMemo(() => {
    const count = selectedItems().length;
    const unscheduledCount = unscheduled().length;
    if (count === 0 && unscheduledCount > 0) return `${unscheduledCount} pendientes siguen sin fecha`;
    if (count === 0) return 'Día limpio por ahora';
    if (count === 1) return 'Solo una tarea cae en esta fecha';
    return `${count} tareas concentradas en el día`;
  });

  const recurringCount = createMemo(() => selectedItems().filter((story) => isRecurring(story)).length);

  const storyTimingMeta = (story: Story, day: Date) => {
    const dayKey = toLocalDateStr(day);
    if (isRecurring(story)) {
      return {
        label: 'Rutina del día',
        tone: 'bg-purple-500/12 text-purple-300',
      };
    }

    if (story.scheduled_date?.split('T')[0] === dayKey) {
      return {
        label: 'Agendada',
        tone: 'bg-ios-blue-500/12 text-ios-blue-300',
      };
    }

    if (story.due_date?.split('T')[0] === dayKey) {
      return {
        label: 'Entrega',
        tone: 'bg-amber-500/12 text-amber-300',
      };
    }

    return {
      label: 'Calendario',
      tone: 'bg-base-content/[0.06] text-base-content/45',
    };
  };

  return (
    <>
      <div class="sm:hidden space-y-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <section class="rounded-[30px] border border-base-content/[0.08] bg-[linear-gradient(155deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-3.5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              <div class="w-10 h-10 rounded-2xl bg-base-content/[0.05] flex items-center justify-center text-base-content/65 shrink-0">
                <CalendarDays size={17} />
              </div>
              <div class="min-w-0">
                <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-base-content/25">Tu agenda</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <h1 class="text-[24px] leading-none font-semibold tracking-tight text-base-content/92">
                    Calendario
                  </h1>
                </div>
              </div>
            </div>
            <div class="rounded-[18px] border border-base-content/[0.06] bg-base-content/[0.04] px-3 py-1.5 text-right shrink-0">
              <p class="text-[17px] leading-none font-semibold text-base-content/88">{scheduledDaysCount()}/{days.length}</p>
              <p class="mt-1 text-[9px] uppercase tracking-[0.12em] text-base-content/28">con carga</p>
            </div>
          </div>

          <div class="mt-3 grid grid-cols-3 gap-2">
            <div class="rounded-2xl border border-base-content/[0.06] bg-base-content/[0.035] px-3 py-2">
              <p class="text-[10px] uppercase tracking-[0.12em] text-base-content/28">Hoy</p>
              <p class="mt-1 text-[17px] leading-none font-semibold text-base-content/88">{itemsByDay().get(toLocalDateStr(days[0]))?.length ?? 0}</p>
              <p class="mt-1 text-[10px] text-base-content/34">en agenda</p>
            </div>
            <div class="rounded-2xl border border-base-content/[0.06] bg-base-content/[0.035] px-3 py-2">
              <p class="text-[10px] uppercase tracking-[0.12em] text-base-content/28">Ventana</p>
              <p class="mt-1 text-[17px] leading-none font-semibold text-base-content/88">{totalVisibleItems()}</p>
              <p class="mt-1 text-[10px] text-base-content/34">visibles</p>
            </div>
            <div class="rounded-2xl border border-base-content/[0.06] bg-base-content/[0.035] px-3 py-2">
              <p class="text-[10px] uppercase tracking-[0.12em] text-base-content/28">Sin fecha</p>
              <p class="mt-1 text-[17px] leading-none font-semibold text-base-content/88">{unscheduled().length}</p>
              <p class="mt-1 text-[10px] text-base-content/34">por ubicar</p>
            </div>
          </div>

          <div class="mt-3">
            <div class="mb-1.5 flex items-center justify-between gap-3">
              <p class="text-[11px] font-semibold text-base-content/45">Elige el día que quieres revisar</p>
              <span class="text-[10px] text-base-content/22">scroll horizontal</span>
            </div>
            <div class="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              <For each={days}>
                {(day, index) => {
                  const key = toLocalDateStr(day);
                  const active = () => key === toLocalDateStr(selectedDay());
                  const count = () => itemsByDay().get(key)?.length ?? 0;
                  const hasItems = () => count() > 0;
                  return (
                    <button
                      onClick={() => setSelectedDay(day)}
                      class={`min-w-[84px] overflow-hidden rounded-[22px] border px-3 py-2.5 text-left transition-all ${
                        active()
                          ? 'border-ios-blue-500/24 bg-ios-blue-500/12 text-ios-blue-300 shadow-[0_12px_32px_rgba(45,125,255,0.16)]'
                          : 'border-base-content/[0.06] bg-base-100/28 text-base-content/70'
                      }`}
                    >
                      <div class="flex items-center justify-between gap-2">
                        <p class="text-[10px] font-bold uppercase tracking-[0.16em]">{dayNames[day.getDay()]}</p>
                        <Show when={hasItems()}>
                          <span class={`h-2 w-2 shrink-0 rounded-full ${active() ? 'bg-ios-blue-200' : 'bg-ios-blue-500/80'}`} />
                        </Show>
                      </div>
                      <div class={`mt-1 h-4 text-[8px] font-bold uppercase tracking-[0.08em] ${index() < 2 ? 'text-current/55' : 'text-transparent'}`}>
                        <Show when={index() < 2} fallback={<span>__</span>}>
                          {relativeLabel(day)}
                        </Show>
                      </div>
                      <p class="mt-1 text-[28px] leading-none font-semibold">{day.getDate()}</p>
                      <div class="mt-2 flex items-center justify-between gap-2">
                        <p class="text-[11px] text-current/78">{monthNames[day.getMonth()]}</p>
                        <div class="flex items-center gap-1.5 shrink-0">
                          <Show when={hasItems()}>
                            <span class={`h-1.5 w-1.5 rounded-full ${active() ? 'bg-ios-blue-200' : 'bg-ios-blue-500/80'}`} />
                          </Show>
                          <span class="text-[10px] text-current/62">{dayLoadLabel(count())}</span>
                        </div>
                      </div>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>
        </section>

        <section class="rounded-[28px] border border-base-content/[0.08] bg-base-200/35 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="min-w-0">
              <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/24">{relativeLabel(selectedDay())}</p>
              <h2 class="mt-1 text-[21px] leading-tight font-semibold text-base-content/90">
                {selectedDay().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <div class="mt-2 text-[12px] text-base-content/40 flex items-center gap-3">
                 <span>{selectedDaySubtitle()}</span>
                 <button 
                   onClick={() => props.onRequestQuickAdd?.(toLocalDateStr(selectedDay()))}
                   class="flex items-center gap-1.5 bg-ios-blue-500/10 text-ios-blue-500 px-2.5 py-1 rounded-lg font-bold text-[10px] active:scale-95 transition-transform"
                 >
                   <Plus size={12} strokeWidth={2.5} />
                   Añadir
                 </button>
              </div>
            </div>
            <div class="rounded-[18px] border border-base-content/[0.06] bg-base-content/[0.04] px-3 py-2 text-right shrink-0">
              <p class="text-[18px] leading-none font-semibold text-base-content/86">{selectedItems().length}</p>
              <p class="mt-1 text-[10px] uppercase tracking-[0.12em] text-base-content/26">
                {selectedItems().length === 1 ? 'tarea' : 'tareas'}
              </p>
            </div>
          </div>

          <Show when={selectedItems().length > 0}>
            <div class="mb-3 flex items-center gap-2 flex-wrap">
              <span class="rounded-full bg-base-content/[0.05] px-3 py-1.5 text-[11px] font-medium text-base-content/46">
                {selectedItems().length === 1 ? '1 tarea activa' : `${selectedItems().length} tareas activas`}
              </span>
              <Show when={recurringCount() > 0}>
                <span class="rounded-full bg-purple-500/12 px-3 py-1.5 text-[11px] font-medium text-purple-300">
                  {recurringCount() === 1 ? '1 recurrente' : `${recurringCount()} recurrentes`}
                </span>
              </Show>
            </div>
          </Show>

          <div class="space-y-2.5">
            <For each={selectedItems()}>
              {(story) => {
                const project = projectFor(story);
                const recurring = isRecurring(story);
                const completionKey = `${story.id}:${toLocalDateStr(selectedDay())}`;
                const isCompleted = () => completionSet().has(completionKey);
                const completing = () => completingIds().has(story.id);
                const timing = storyTimingMeta(story, selectedDay());

                return (
                  <button
                    onClick={() => setSelectedStory(story)}
                    class={`w-full rounded-[24px] border px-4 py-3.5 text-left transition-all ${
                      isCompleted()
                        ? 'border-base-content/[0.06] bg-base-content/[0.03] opacity-70'
                        : 'border-base-content/[0.06] bg-base-100/42 hover:bg-base-100/62'
                    }`}
                  >
                    <div class="flex items-start gap-3">
                      <Show
                        when={recurring}
                        fallback={
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              if (completing()) return;
                              markStoryDone(story);
                            }}
                            class="w-10 h-10 rounded-2xl bg-base-content/[0.04] flex items-center justify-center shrink-0"
                          >
                            <Show when={completing()} fallback={<Circle size={18} class="text-base-content/25" />}>
                              <Loader2 size={16} class="animate-spin text-base-content/30" />
                            </Show>
                          </button>
                        }
                      >
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleRecurringCompletion(story, toLocalDateStr(selectedDay()));
                          }}
                          class="w-10 h-10 rounded-2xl bg-base-content/[0.04] flex items-center justify-center shrink-0"
                        >
                          <Show when={isCompleted()} fallback={<Circle size={18} class="text-base-content/25" />}>
                            <CheckCircle2 size={18} class="text-ios-green-500" />
                          </Show>
                        </button>
                      </Show>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <p class={`text-[14px] leading-snug font-medium whitespace-normal break-words ${isCompleted() ? 'line-through text-base-content/40' : 'text-base-content/85'}`}>
                            {story.title}
                          </p>
                          <Show when={project}>
                            <span
                              class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ "background-color": `${project!.color}18`, color: project!.color }}
                            >
                              {project!.prefix}
                            </span>
                          </Show>
                          <Show when={recurring}>
                            <span class="inline-flex items-center gap-1 text-[10px] font-bold text-purple-400">
                              <RefreshCw size={11} />
                              Recurrente
                            </span>
                          </Show>
                          <Show when={story.status === 'in_progress' && !isCompleted()}>
                            <span class="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                              En curso
                            </span>
                          </Show>
                        </div>
                        <div class="mt-2 flex items-center gap-2 flex-wrap text-[10px]">
                          <span class={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${timing.tone}`}>
                            {timing.label}
                          </span>
                          <Show when={project && !recurring}>
                            <span class="inline-flex items-center gap-1 rounded-full bg-base-content/[0.05] px-2.5 py-1 text-base-content/40">
                              Proyecto {project!.name}
                            </span>
                          </Show>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              }}
            </For>

            <Show when={selectedItems().length === 0}>
              <div class="rounded-[24px] border border-dashed border-base-content/[0.08] bg-base-content/[0.02] px-4 py-8 text-center">
                <p class="text-[14px] font-semibold text-base-content/42">Sin tareas en esta fecha</p>
                <p class="mt-2 text-[12px] leading-relaxed text-base-content/26">
                  {unscheduled().length > 0 ? `Todavía tienes ${unscheduled().length} pendientes que podrías mover al calendario.` : 'No hay nada pendiente para este día.'}
                </p>
              </div>
            </Show>
          </div>
        </section>

        <Show when={unscheduled().length > 0}>
          <section class="rounded-[26px] border border-base-content/[0.08] bg-base-200/25 p-4 shadow-[0_8px_28px_rgba(0,0,0,0.1)]">
            <div class="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 class="text-[16px] font-semibold text-base-content/90">Sin fecha</h2>
                <p class="text-[11px] text-base-content/30">Pendientes que todavía no entran a tu agenda</p>
              </div>
              <span class="rounded-full bg-base-content/[0.05] px-2.5 py-1 text-[10px] font-semibold text-base-content/40">
                {unscheduled().length}
              </span>
            </div>
            <div class="space-y-2">
              <For each={unscheduled().slice(0, 6)}>
                {(story) => {
                  const project = projectFor(story);
                  return (
                    <button
                      onClick={() => setSelectedStory(story)}
                      class="w-full rounded-[22px] border border-base-content/[0.06] bg-base-100/32 px-4 py-3 text-left transition-all hover:bg-base-100/52"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <p class="min-w-0 text-[13px] leading-snug font-medium text-base-content/78 whitespace-normal break-words">
                          {story.title}
                        </p>
                        <Show when={project}>
                          <span
                            class="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold"
                            style={{ "background-color": `${project!.color}16`, color: project!.color }}
                          >
                            {project!.prefix}
                          </span>
                        </Show>
                      </div>
                    </button>
                  );
                }}
              </For>
            </div>
          </section>
        </Show>
      </div>

      <Show when={selectedStory()}>
        {(story) => (
          <MobileStoryDetail
            story={story()}
            onClose={() => setSelectedStory(null)}
            onUpdated={(id, fields) => {
              setLocalStories(prev => {
                if (fields.is_active === false) {
                  return prev.filter(storyItem => storyItem.id !== id);
                }
                return prev.map(storyItem => storyItem.id === id ? { ...storyItem, ...fields } as Story : storyItem);
              });
            }}
            onDeleted={() => {
              setLocalStories(prev => prev.filter(storyItem => storyItem.id !== story().id));
              setSelectedStory(null);
            }}
          />
        )}
      </Show>
    </>
  );
};

export default MobileCalendarPage;
