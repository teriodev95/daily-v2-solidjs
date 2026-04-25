import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import type { Story, Assignment } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { useOnceReady } from '../lib/onceReady';
import {
  CheckCircle, Circle, ArrowRight, PackageCheck, Repeat,
  ChevronRight, Calendar, Flame, ArrowUp, ArrowDown,
  Target, RefreshCw,
} from 'lucide-solid';
import StoryDetail from '../components/StoryDetail';
import AssignmentDetail from '../components/AssignmentDetail';

const priorityIcon: Record<string, any> = {
  critical: Flame,
  high: ArrowUp,
  medium: ArrowRight,
  low: ArrowDown,
};

const priorityColor: Record<string, string> = {
  critical: 'text-red-500',
  high: 'text-orange-500',
  medium: 'text-ios-blue-500',
  low: 'text-base-content/30',
};

interface DashboardPageProps {
  refreshKey?: number;
  onStoryDeleted?: () => void;
}

const DashboardPage: Component<DashboardPageProps> = (props) => {
  const auth = useAuth();
  const data = useData();
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);
  const [selectedAssignment, setSelectedAssignment] = createSignal<Assignment | null>(null);

  const userId = () => auth.user()?.id ?? '';

  const [stories] = createResource(
    () => ({ uid: userId(), _r: props.refreshKey }),
    ({ uid }) => api.stories.list({ assignee_id: uid }),
  );

  const [assignmentsList] = createResource(userId, (uid) =>
    api.assignments.list({ assigned_to: uid, status: 'open' })
  );

  const [goalsList] = createResource(userId, (uid) =>
    api.goals.list({ user_id: uid })
  );

  const ready = useOnceReady(stories);

  const myStories = () =>
    (stories() ?? []).filter(
      s => s.status !== 'done' && s.code !== null && s.frequency === null
    );

  const myAssignments = () => assignmentsList() ?? [];

  const myRecurring = () =>
    (stories() ?? []).filter(
      s => s.frequency !== null && s.recurring_parent_id === null && s.is_active
    );

  const todayStories = () =>
    (stories() ?? []).filter(s => s.category === 'today').sort((a, b) => a.sort_order - b.sort_order);

  const myGoals = () => goalsList() ?? [];

  const getDaysUntil = (dateStr: string | null) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const frequencyLabel: Record<string, string> = {
    daily: 'Diaria',
    weekly: 'Semanal',
    monthly: 'Mensual',
  };

  return (
    <>
      <Show when={ready()} fallback={<DashboardSkeleton />}>
        <div class="space-y-6">

          {/* Quick summary */}
          <div class="flex items-center gap-3 flex-wrap">
            <div class="group flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-base-200/40 border border-base-content/[0.04] text-[13px] font-medium transition-all hover:bg-base-200/60 hover:shadow-sm">
              <div class="flex items-center justify-center w-6 h-6 rounded-lg bg-ios-blue-500/10 group-hover:bg-ios-blue-500/20 transition-colors">
                <ArrowRight size={14} class="text-ios-blue-500" strokeWidth={2.5} />
              </div>
              <span class="text-base-content/70 group-hover:text-base-content/90 transition-colors">{todayStories().length} tareas hoy</span>
            </div>
            <div class="group flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-base-200/40 border border-base-content/[0.04] text-[13px] font-medium transition-all hover:bg-base-200/60 hover:shadow-sm">
              <div class="flex items-center justify-center w-6 h-6 rounded-lg bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors">
                <PackageCheck size={14} class="text-orange-500" strokeWidth={2.5} />
              </div>
              <span class="text-base-content/70 group-hover:text-base-content/90 transition-colors">{myAssignments().length} encomiendas</span>
            </div>
            <div class="group flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-base-200/40 border border-base-content/[0.04] text-[13px] font-medium transition-all hover:bg-base-200/60 hover:shadow-sm">
              <div class="flex items-center justify-center w-6 h-6 rounded-lg bg-ios-green-500/10 group-hover:bg-ios-green-500/20 transition-colors">
                <Target size={14} class="text-ios-green-500" strokeWidth={2.5} />
              </div>
              <span class="text-base-content/70 group-hover:text-base-content/90 transition-colors">{myGoals().filter(g => !g.is_completed).length} objetivos</span>
            </div>
          </div>

          {/* My HUs */}
          <Show when={myStories().length > 0}>
            <section class="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <h2 class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-base-content/40 mb-3.5 px-1">
                <div class="w-1.5 h-1.5 rounded-full bg-base-content/20" />
                Mis historias asignadas
              </h2>
              <div class="space-y-2">
                <For each={myStories()}>
                  {(story) => {
                    const project = data.getProjectById(story.project_id!);
                    const PIcon = priorityIcon[story.priority];
                    const daysUntil = getDaysUntil(story.due_date);

                    return (
                      <button
                        onClick={() => setSelectedStory(story)}
                        class="relative w-full text-left flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-base-100/60 border border-base-content/[0.04] hover:border-base-content/[0.1] hover:bg-base-100 transition-all duration-200 group cursor-pointer hover:shadow-sm hover:-translate-y-0.5"
                      >
                        <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-md transition-all group-hover:h-10 group-hover:w-1.5" style={{ "background-color": project?.color ?? '#525252' }} />

                        <div class={`flex items-center justify-center w-8 h-8 rounded-xl bg-base-content/[0.03] ml-1 shrink-0 ${priorityColor[story.priority]}`}>
                          <PIcon size={16} strokeWidth={2.5} />
                        </div>

                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] font-mono font-bold text-base-content/40 tracking-wider">{story.code}</span>
                            <Show when={project}>
                              <span
                                class="text-[10px] font-bold px-2 py-0.5 rounded-md"
                                style={{
                                  "background-color": `${project!.color}15`,
                                  color: project!.color,
                                }}
                              >
                                {project!.name}
                              </span>
                            </Show>
                            <Show when={story.status === 'in_progress'}>
                              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600">En progreso</span>
                            </Show>
                          </div>
                          <p class="text-[14px] sm:text-[15px] font-medium truncate text-base-content/90 group-hover:text-base-content transition-colors flex items-center gap-1.5">
                            {story.title}
                            <Show when={story.frequency}><RefreshCw size={9} class="text-purple-500/50 shrink-0" /></Show>
                          </p>
                        </div>

                        <div class="flex flex-col items-end gap-1.5 shrink-0">
                          <Show when={story.estimate > 0}>
                            <span class="text-[11px] font-medium text-base-content/40 bg-base-content/[0.04] px-2 py-0.5 rounded-md">{story.estimate} pts</span>
                          </Show>
                          <Show when={daysUntil !== null}>
                            <span class={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${daysUntil! < 0 ? 'bg-red-500/10 text-red-500' : daysUntil! <= 3 ? 'bg-amber-500/10 text-amber-600' : 'bg-base-content/[0.04] text-base-content/50'
                              }`}>
                              <Calendar size={10} />
                              {daysUntil! < 0 ? `${Math.abs(daysUntil!)}d vencida` : `${daysUntil}d`}
                            </span>
                          </Show>
                        </div>

                        <ChevronRight size={16} strokeWidth={2.5} class="text-base-content/20 shrink-0 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                      </button>
                    );
                  }}
                </For>
              </div>
            </section>
          </Show>

          {/* Encomiendas */}
          <Show when={myAssignments().length > 0}>
            <section class="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-75">
              <h2 class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-base-content/40 mb-3.5 px-1">
                <div class="w-1.5 h-1.5 rounded-full bg-orange-500/40" />
                Encomiendas abiertas
              </h2>
              <div class="space-y-2">
                <For each={myAssignments()}>
                  {(assignment) => {
                    const project = assignment.project_id ? data.getProjectById(assignment.project_id) : null;
                    const assignedBy = data.getUserById(assignment.assigned_by);
                    const daysUntil = getDaysUntil(assignment.due_date);

                    return (
                      <button
                        onClick={() => setSelectedAssignment(assignment)}
                        class="w-full text-left flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-base-100/60 border border-base-content/[0.04] hover:border-orange-500/20 hover:bg-orange-500/[0.02] transition-all duration-200 cursor-pointer group hover:shadow-sm hover:-translate-y-0.5"
                      >
                        <div class="flex items-center justify-center w-8 h-8 rounded-xl bg-orange-500/10 shrink-0 group-hover:bg-orange-500/20 transition-colors">
                          <PackageCheck size={16} strokeWidth={2.5} class="text-orange-500" />
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 mb-1">
                            <Show when={project}>
                              <span
                                class="text-[10px] font-bold px-2 py-0.5 rounded-md"
                                style={{
                                  "background-color": `${project!.color}15`,
                                  color: project!.color,
                                }}
                              >
                                {project!.name}
                              </span>
                            </Show>
                            <Show when={assignedBy}>
                              <span class="flex items-center gap-1.5 text-[10px] text-base-content/40 font-medium">
                                <img src={assignedBy!.avatar_url!} alt="" class="w-3.5 h-3.5 rounded-full" />
                                de {assignedBy!.name.split(' ')[0]}
                              </span>
                            </Show>
                          </div>
                          <p class="text-[14px] sm:text-[15px] font-medium truncate text-base-content/90 group-hover:text-base-content transition-colors">{assignment.title}</p>
                          <p class="text-[12px] text-base-content/50 truncate mt-0.5 pr-2">{assignment.description}</p>
                        </div>
                        <Show when={daysUntil !== null}>
                          <div class={`flex items-center gap-1.5 text-[11px] font-medium shrink-0 px-2.5 py-1 rounded-lg ${daysUntil! < 0
                              ? 'bg-red-500/10 text-red-500'
                              : daysUntil! <= 2
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-base-content/[0.04] text-base-content/50'
                            }`}>
                            <Calendar size={12} strokeWidth={2.5} />
                            {daysUntil! < 0 ? 'Vencida' : `${daysUntil}d`}
                          </div>
                        </Show>
                        <ChevronRight size={16} strokeWidth={2.5} class="text-base-content/20 shrink-0 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                      </button>
                    );
                  }}
                </For>
              </div>
            </section>
          </Show>

          {/* Recurring */}
          <Show when={myRecurring().length > 0}>
            <section class="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
              <h2 class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-base-content/40 mb-3.5 px-1">
                <div class="w-1.5 h-1.5 rounded-full bg-ios-blue-500/40" />
                HUs recurrentes
              </h2>
              <div class="space-y-2">
                <For each={myRecurring()}>
                  {(story) => (
                    <div class="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-base-100/60 border border-base-content/[0.04]">
                      <div class="flex items-center justify-center w-8 h-8 rounded-xl bg-ios-blue-500/10 shrink-0">
                        <Repeat size={16} strokeWidth={2.5} class="text-ios-blue-500" />
                      </div>
                      <span class="text-[14px] sm:text-[15px] font-medium text-base-content/90 flex-1">{story.title}</span>
                      <span class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-base-content/[0.04] text-base-content/50 uppercase tracking-widest">
                        {frequencyLabel[story.frequency!]}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </Show>

          {/* Week Goals */}
          <section class="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150">
            <h2 class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-base-content/40 mb-3.5 px-1">
              <div class="w-1.5 h-1.5 rounded-full bg-ios-green-500/40" />
              Objetivos de la semana
            </h2>
            <div class="space-y-2">
              <For each={myGoals()}>
                {(goal) => (
                  <div class="flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-base-100/60 border border-base-content/[0.04] transition-colors hover:bg-base-100">
                    <Show when={goal.is_completed} fallback={<Circle size={18} strokeWidth={2.5} class="text-base-content/20 shrink-0 mt-0.5" />}>
                      <CheckCircle size={18} strokeWidth={2.5} class="text-ios-green-500 shrink-0 mt-0.5" />
                    </Show>
                    <span class={`text-[14px] sm:text-[15px] leading-relaxed font-medium ${goal.is_completed ? 'line-through text-base-content/40 decoration-base-content/30' : 'text-base-content/90'}`}>
                      {goal.text}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </section>
        </div>
      </Show>

      {/* Story Detail Modal */}
      <Show when={selectedStory()}>
        {(story) => (
          <StoryDetail story={story()} onClose={() => setSelectedStory(null)} onDeleted={() => { setSelectedStory(null); props.onStoryDeleted?.(); }} />
        )}
      </Show>

      {/* Assignment Detail Modal */}
      <Show when={selectedAssignment()}>
        {(assignment) => (
          <AssignmentDetail assignment={assignment()} onClose={() => setSelectedAssignment(null)} />
        )}
      </Show>
    </>
  );
};

const DashboardSkeleton: Component = () => (
  <div class="space-y-6 animate-pulse">
    <div class="flex gap-3">
      <div class="h-10 w-32 rounded-xl bg-base-200/60" />
      <div class="h-10 w-32 rounded-xl bg-base-200/60" />
      <div class="h-10 w-32 rounded-xl bg-base-200/60" />
    </div>
    <div class="space-y-2">
      <div class="h-3 w-40 rounded bg-base-200/60" />
      <div class="h-16 rounded-xl bg-base-200/60" />
      <div class="h-16 rounded-xl bg-base-200/60" />
    </div>
  </div>
);

export default DashboardPage;
