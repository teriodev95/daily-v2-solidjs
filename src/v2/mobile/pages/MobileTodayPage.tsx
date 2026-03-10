import { createEffect, createResource, createSignal, For, Show, type Component } from 'solid-js';
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  RefreshCw,
  Send,
  Target,
} from 'lucide-solid';
import type { Assignment, Story, StoryCompletion } from '../../types';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { isRecurring, toLocalDateStr } from '../../lib/recurrence';
import MobileShareReportSheet from '../components/MobileShareReportSheet';
import MobileAssignmentDetail from '../components/MobileAssignmentDetail';
import MobileStoryDetail from '../components/MobileStoryDetail';
import { getTodayView } from '../lib/mobileSelectors';

interface MobileTodayPageProps {
  refreshKey?: number;
}

const MobileTodayPage: Component<MobileTodayPageProps> = (props) => {
  const auth = useAuth();
  const data = useData();
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);
  const [selectedAssignment, setSelectedAssignment] = createSignal<Assignment | null>(null);
  const [showShare, setShowShare] = createSignal(false);
  const [completingIds, setCompletingIds] = createSignal<Set<string>>(new Set());

  const todayKey = toLocalDateStr(new Date());
  const userId = () => auth.user()?.id ?? '';

  const [reportData] = createResource(
    () => ({ date: todayKey, uid: userId(), _r: props.refreshKey }),
    ({ date, uid }) => uid ? api.reports.getByDate(date).catch(() => null) : Promise.resolve(null),
  );

  const [stories] = createResource(
    () => ({ uid: userId(), _r: props.refreshKey }),
    ({ uid }) => uid ? api.stories.list({ assignee_id: uid }) : Promise.resolve([]),
  );

  const [goalsList] = createResource(userId, uid =>
    uid ? api.goals.list({ user_id: uid }) : Promise.resolve([]),
  );

  const [assignmentsList] = createResource(
    () => ({ uid: userId(), _r: props.refreshKey }),
    ({ uid }) => uid ? api.assignments.list({ assigned_to: uid, status: 'open' }) : Promise.resolve([]),
  );

  const [todayCompletions, { mutate: mutateCompletions }] = createResource(
    () => ({ uid: userId(), date: todayKey }),
    ({ uid, date }) => uid ? api.completions.list(date, date) : Promise.resolve([]),
  );

  const [localStories, setLocalStories] = createSignal<Story[]>([]);
  const [localAssignments, setLocalAssignments] = createSignal<Assignment[]>([]);

  createEffect(() => {
    const fetched = stories();
    if (fetched) setLocalStories(fetched as Story[]);
  });

  createEffect(() => {
    const fetched = assignmentsList();
    if (fetched) setLocalAssignments(fetched as Assignment[]);
  });

  const todayView = () => getTodayView(localStories(), localAssignments());
  const report = () => reportData();
  const goals = () => goalsList() ?? [];

  const todayCompletionSet = (): Set<string> => {
    const set = new Set<string>();
    for (const completion of todayCompletions() ?? []) {
      set.add(completion.story_id);
    }
    return set;
  };

  const toggleRecurringCompletion = (storyId: string) => {
    const completed = todayCompletionSet().has(storyId);
    if (completed) {
      mutateCompletions(prev => (prev ?? []).filter(completion => completion.story_id !== storyId));
      api.completions.delete(storyId, todayKey).catch(() => {});
      return;
    }

    const optimistic: StoryCompletion = {
      id: `temp-${Date.now()}`,
      story_id: storyId,
      user_id: userId(),
      completion_date: todayKey,
      created_at: new Date().toISOString(),
    };
    mutateCompletions(prev => [...(prev ?? []), optimistic]);
    api.completions.create(storyId, todayKey).catch(() => {});
  };

  const markStoryDone = async (story: Story) => {
    const previousStatus = story.status;
    const previousCompletedAt = story.completed_at;
    const storyId = story.id;
    const completedAt = new Date().toISOString();
    setCompletingIds((prev) => new Set(prev).add(storyId));
    setLocalStories((prev) =>
      prev.map((item) => item.id === storyId ? { ...item, status: 'done' as Story['status'], completed_at: completedAt } : item),
    );
    try {
      await api.stories.update(storyId, { status: 'done', completed_at: completedAt });
    } catch {
      setLocalStories((prev) =>
        prev.map((item) => item.id === storyId ? { ...item, status: previousStatus, completed_at: previousCompletedAt } : item),
      );
    } finally {
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(storyId);
        return next;
      });
    }
  };

  const projectFor = (story: Story) => story.project_id ? data.getProjectById(story.project_id) : null;
  const assignmentProject = (assignment: Assignment) => assignment.project_id ? data.getProjectById(assignment.project_id) : null;

  const dueLabel = (story: Story) => {
    const value = story.scheduled_date ?? story.due_date;
    if (!value) return null;
    const key = value.split('T')[0];
    if (key === todayKey) return 'Hoy';
    const date = new Date(key + 'T12:00:00');
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  const assignmentDueMeta = (assignment: Assignment) => {
    if (!assignment.due_date) {
      return {
        badge: 'Sin fecha',
        detail: 'Sin vencimiento definido',
        badgeClass: 'bg-base-content/[0.05] text-base-content/45',
        detailClass: 'text-base-content/32',
      };
    }

    const today = new Date(`${todayKey}T12:00:00`);
    const due = new Date(`${assignment.due_date}T12:00:00`);
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    const exact = due.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

    if (diff < 0) {
      return {
        badge: `Vencida ${Math.abs(diff)}d`,
        detail: `Debió entregarse ${exact}`,
        badgeClass: 'bg-red-500/14 text-red-400',
        detailClass: 'text-red-300/75',
      };
    }

    if (diff === 0) {
      return {
        badge: 'Hoy',
        detail: `Vence ${exact}`,
        badgeClass: 'bg-amber-500/14 text-amber-300',
        detailClass: 'text-amber-200/75',
      };
    }

    if (diff === 1) {
      return {
        badge: 'Mañana',
        detail: `Vence ${exact}`,
        badgeClass: 'bg-ios-blue-500/14 text-ios-blue-300',
        detailClass: 'text-ios-blue-200/75',
      };
    }

    return {
      badge: `${diff} días`,
      detail: `Vence ${exact}`,
      badgeClass: 'bg-purple-500/14 text-purple-300',
      detailClass: 'text-base-content/38',
    };
  };

  const SectionCard = (sectionProps: {
    title: string;
    subtitle: string;
    icon: any;
    accent: string;
    stories: Story[];
    empty: string;
    recurring?: boolean;
  }) => {
    const Icon = sectionProps.icon;
    return (
      <section class="rounded-[26px] border border-base-content/[0.08] bg-base-200/35 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ "background-color": `${sectionProps.accent}18`, color: sectionProps.accent }}>
              <Icon size={18} />
            </div>
            <div>
              <h2 class="text-[15px] font-semibold text-base-content/90">{sectionProps.title}</h2>
              <p class="text-[11px] text-base-content/30">{sectionProps.subtitle}</p>
            </div>
          </div>
          <span class="text-[11px] font-bold text-base-content/25">{sectionProps.stories.length}</span>
        </div>

        <div class="space-y-2">
          <For each={sectionProps.stories}>
            {(story) => {
              const project = projectFor(story);
              const isRecurringToday = () => sectionProps.recurring && isRecurring(story);
              const completedToday = () => todayCompletionSet().has(story.id);
              const completing = () => completingIds().has(story.id);

              return (
                <button
                  onClick={() => setSelectedStory(story)}
                  class={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                    completedToday()
                      ? 'border-base-content/[0.06] bg-base-content/[0.03] opacity-65'
                      : 'border-base-content/[0.06] bg-base-100/45 hover:bg-base-100/65'
                  }`}
                >
                  <div class="flex items-start gap-3">
                    <Show
                      when={isRecurringToday()}
                      fallback={
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            if (completing()) return;
                            markStoryDone(story);
                          }}
                          class="w-9 h-9 rounded-xl bg-base-content/[0.04] flex items-center justify-center shrink-0"
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
                          toggleRecurringCompletion(story.id);
                        }}
                        class="w-9 h-9 rounded-xl bg-base-content/[0.04] flex items-center justify-center shrink-0"
                      >
                        <Show when={completedToday()} fallback={<Circle size={18} class="text-base-content/25" />}>
                          <CheckCircle2 size={18} class="text-ios-green-500" />
                        </Show>
                      </button>
                    </Show>

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <p class={`text-[14px] font-medium ${completedToday() ? 'line-through text-base-content/40' : 'text-base-content/85'}`}>
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
                        <Show when={story.status === 'in_progress' && !completedToday()}>
                          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500">En progreso</span>
                        </Show>
                      </div>
                      <div class="mt-2 flex items-center gap-3 flex-wrap text-[10px] text-base-content/30">
                        <Show when={dueLabel(story)}>
                          <span class="inline-flex items-center gap-1">
                            <CalendarClock size={11} />
                            {dueLabel(story)}
                          </span>
                        </Show>
                        <Show when={isRecurringToday()}>
                          <span class="inline-flex items-center gap-1 text-purple-400">
                            <RefreshCw size={11} />
                            Recurrente
                          </span>
                        </Show>
                      </div>
                    </div>
                  </div>
                </button>
              );
            }}
          </For>

          <Show when={sectionProps.stories.length === 0}>
            <div class="rounded-2xl border border-dashed border-base-content/[0.08] px-4 py-6 text-center text-[12px] font-medium text-base-content/25">
              {sectionProps.empty}
            </div>
          </Show>
        </div>
      </section>
    );
  };

  return (
    <>
      <div class="sm:hidden space-y-4 pb-[calc(9rem+env(safe-area-inset-bottom))]">
        <section class="rounded-[28px] border border-base-content/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_44px_rgba(0,0,0,0.18)]">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/25">Hoy</p>
              <h1 class="text-[28px] leading-none font-semibold tracking-tight text-base-content/92 mt-1">
                {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h1>
              <p class="text-[12px] text-base-content/35 mt-2">
                {todayView().agenda.length} en agenda · {todayView().active.length} activas · {todayView().assignments.length} encomiendas
              </p>
            </div>
            <button
              onClick={() => setShowShare(true)}
              class="flex items-center gap-2 rounded-2xl bg-[#0088cc]/14 px-3 py-2 text-[12px] font-semibold text-[#45a9e6]"
            >
              <Send size={14} />
              Compartir
            </button>
          </div>

          <Show when={todayView().assignments.length > 0}>
            <div class="mt-4 rounded-[22px] border border-base-content/[0.05] bg-base-content/[0.025] p-3">
              <div class="mb-2 flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <div class="flex h-7 w-7 items-center justify-center rounded-2xl bg-purple-500/12 text-purple-400">
                    <PackageCheck size={14} />
                  </div>
                  <div>
                    <p class="text-[12px] font-semibold text-base-content/82">Encomiendas de hoy</p>
                    <p class="text-[10px] text-base-content/28">
                      {todayView().assignments.length === 1 ? '1 pendiente' : `${todayView().assignments.length} pendientes`}
                    </p>
                  </div>
                </div>
                <span class="text-[10px] font-medium text-base-content/22">Prioridad compartida</span>
              </div>

              <div class="space-y-1.5">
                <For each={todayView().assignments.slice(0, 2)}>
                  {(assignment) => {
                    const assigner = data.getUserById(assignment.assigned_by);
                    const project = assignmentProject(assignment);
                    const due = assignmentDueMeta(assignment);
                    return (
                      <button
                        onClick={() => setSelectedAssignment(assignment)}
                        class="block w-full rounded-2xl border border-base-content/[0.05] bg-base-100/22 px-3 py-2.5 text-left transition-all hover:bg-base-100/32"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0 flex-1">
                            <p class="text-[13px] font-medium leading-snug text-base-content/84 whitespace-normal break-words">
                              {assignment.title}
                            </p>
                            <div class="mt-1 flex items-center gap-2 flex-wrap text-[10px] text-base-content/35">
                              <Show when={assigner}>
                                <span class="inline-flex items-center gap-1 rounded-full bg-base-content/[0.04] px-2 py-1">
                                  <span class="font-semibold">De {assigner!.name.split(' ')[0]}</span>
                                </span>
                              </Show>
                              <Show when={project}>
                                <span
                                  class="inline-flex items-center gap-1 rounded-full px-2 py-1 font-bold"
                                  style={{ 'background-color': `${project!.color}16`, color: project!.color }}
                                >
                                  <span class="h-2 w-2 rounded-full" style={{ 'background-color': project!.color }} />
                                  {project!.prefix}
                                </span>
                              </Show>
                            </div>
                          </div>
                          <span class={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${due.badgeClass}`}>
                            {due.badge}
                          </span>
                        </div>
                        <div class={`mt-2 inline-flex items-center gap-1 text-[10px] ${due.detailClass}`}>
                          <CalendarClock size={11} />
                          {due.detail}
                        </div>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </section>

        {SectionCard({
          title: 'Agenda de hoy',
          subtitle: 'Lo que no se debe escapar hoy',
          icon: CalendarClock,
          accent: '#3B82F6',
          stories: todayView().agenda,
          empty: 'Sin agenda urgente para hoy',
          recurring: true,
        })}

        {SectionCard({
          title: 'En curso',
          subtitle: 'Trabajo activo sin fecha urgente',
          icon: Target,
          accent: '#F59E0B',
          stories: todayView().active,
          empty: 'Sin tareas activas fuera de agenda',
        })}

        <Show when={todayView().upcoming.length > 0}>
          {SectionCard({
            title: 'Próximamente',
            subtitle: 'Agendado para días siguientes',
            icon: ClipboardCheck,
            accent: '#8B5CF6',
            stories: todayView().upcoming.slice(0, 4),
            empty: 'Nada próximo',
          })}
        </Show>

        <Show when={todayView().completedToday.length > 0}>
          <section class="rounded-[26px] border border-base-content/[0.08] bg-base-200/30 p-4">
            <div class="flex items-center justify-between gap-3 mb-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-ios-green-500/14 text-ios-green-500 flex items-center justify-center">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h2 class="text-[15px] font-semibold text-base-content/90">Completado hoy</h2>
                  <p class="text-[11px] text-base-content/30">Lo que ya avanzaste</p>
                </div>
              </div>
              <span class="text-[11px] font-bold text-base-content/25">{todayView().completedToday.length}</span>
            </div>

            <div class="space-y-2">
              <For each={todayView().completedToday}>
                {(story) => (
                  <button
                    onClick={() => setSelectedStory(story)}
                    class="w-full rounded-2xl border border-base-content/[0.06] bg-base-content/[0.03] px-4 py-3 text-left"
                  >
                    <p class="text-[13px] font-medium text-base-content/40 line-through">{story.title}</p>
                  </button>
                )}
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

      <Show when={selectedAssignment()}>
        {(assignment) => (
          <MobileAssignmentDetail
            assignment={assignment()}
            onClose={() => setSelectedAssignment(null)}
            onUpdated={(updated) => {
              setLocalAssignments(prev => prev.filter(item => item.id !== updated.id || updated.status !== 'closed'));
              setSelectedAssignment(null);
            }}
          />
        )}
      </Show>

      <Show when={showShare()}>
        <MobileShareReportSheet
          onClose={() => setShowShare(false)}
          completedYesterday={todayView().completedYesterday}
          completedToday={todayView().completedToday}
          activeStories={todayView().agenda.concat(todayView().active)}
          backlogStories={todayView().backlog}
          goals={goals()}
          assignments={todayView().assignments}
          report={report()}
          userName={auth.user()?.name ?? ''}
        />
      </Show>
    </>
  );
};

export default MobileTodayPage;
