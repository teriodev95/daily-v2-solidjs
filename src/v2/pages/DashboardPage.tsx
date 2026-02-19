import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import type { Story, Assignment } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import {
  CheckCircle, Circle, ArrowRight, PackageCheck, Repeat,
  ChevronRight, Calendar, Flame, ArrowUp, ArrowDown,
  Target,
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
      <Show when={!stories.loading} fallback={<DashboardSkeleton />}>
        <div class="space-y-6">

          {/* Quick summary */}
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-base-200/60 text-sm">
              <ArrowRight size={14} class="text-ios-blue-500" />
              <span class="text-base-content/50">{todayStories().length} tareas hoy</span>
            </div>
            <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-base-200/60 text-sm">
              <PackageCheck size={14} class="text-orange-500" />
              <span class="text-base-content/50">{myAssignments().length} encomiendas</span>
            </div>
            <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-base-200/60 text-sm">
              <Target size={14} class="text-ios-green-500" />
              <span class="text-base-content/50">{myGoals().filter(g => !g.is_completed).length} objetivos</span>
            </div>
          </div>

          {/* My HUs */}
          <Show when={myStories().length > 0}>
            <section>
              <h2 class="text-[10px] font-bold uppercase tracking-widest text-base-content/30 mb-3">Mis historias asignadas</h2>
              <div class="space-y-2">
                <For each={myStories()}>
                  {(story) => {
                    const project = data.getProjectById(story.project_id!);
                    const PIcon = priorityIcon[story.priority];
                    const daysUntil = getDaysUntil(story.due_date);

                    return (
                      <button
                        onClick={() => setSelectedStory(story)}
                        class="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl bg-base-200/60 hover:bg-base-200 transition-all group cursor-pointer"
                        style={{ "border-left": `3px solid ${project?.color ?? '#525252'}` }}
                      >
                        <PIcon size={14} class={`${priorityColor[story.priority]} shrink-0`} />

                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 mb-0.5">
                            <span class="text-[9px] font-mono font-bold text-base-content/30">{story.code}</span>
                            <Show when={project}>
                              <span
                                class="text-[9px] font-medium px-1.5 py-0.5 rounded"
                                style={{
                                  "background-color": `${project!.color}15`,
                                  color: project!.color,
                                }}
                              >
                                {project!.name}
                              </span>
                            </Show>
                            <Show when={story.status === 'in_progress'}>
                              <span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">En progreso</span>
                            </Show>
                          </div>
                          <p class="text-sm font-medium truncate">{story.title}</p>
                        </div>

                        <div class="flex flex-col items-end gap-1 shrink-0">
                          <Show when={story.estimate > 0}>
                            <span class="text-[10px] text-base-content/20">{story.estimate} pts</span>
                          </Show>
                          <Show when={daysUntil !== null}>
                            <span class={`text-[10px] ${
                              daysUntil! < 0 ? 'text-red-500' : daysUntil! <= 3 ? 'text-amber-500' : 'text-base-content/20'
                            }`}>
                              {daysUntil! < 0 ? `${Math.abs(daysUntil!)}d vencida` : `${daysUntil}d`}
                            </span>
                          </Show>
                        </div>

                        <ChevronRight size={14} class="text-base-content/10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    );
                  }}
                </For>
              </div>
            </section>
          </Show>

          {/* Encomiendas */}
          <Show when={myAssignments().length > 0}>
            <section>
              <h2 class="text-[10px] font-bold uppercase tracking-widest text-base-content/30 mb-3">Encomiendas abiertas</h2>
              <div class="space-y-2">
                <For each={myAssignments()}>
                  {(assignment) => {
                    const project = assignment.project_id ? data.getProjectById(assignment.project_id) : null;
                    const assignedBy = data.getUserById(assignment.assigned_by);
                    const daysUntil = getDaysUntil(assignment.due_date);

                    return (
                      <button
                        onClick={() => setSelectedAssignment(assignment)}
                        class="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl bg-base-200/60 hover:bg-base-200 transition-all cursor-pointer group"
                      >
                        <PackageCheck size={15} class="text-orange-500 shrink-0" />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 mb-0.5">
                            <Show when={project}>
                              <span
                                class="text-[9px] font-medium px-1.5 py-0.5 rounded"
                                style={{
                                  "background-color": `${project!.color}15`,
                                  color: project!.color,
                                }}
                              >
                                {project!.name}
                              </span>
                            </Show>
                            <Show when={assignedBy}>
                              <span class="text-[9px] text-base-content/25">
                                de {assignedBy!.name.split(' ')[0]}
                              </span>
                            </Show>
                          </div>
                          <p class="text-sm font-medium truncate">{assignment.title}</p>
                          <p class="text-xs text-base-content/35 truncate mt-0.5">{assignment.description}</p>
                        </div>
                        <Show when={daysUntil !== null}>
                          <div class={`flex items-center gap-1 text-[10px] shrink-0 px-2 py-1 rounded-lg ${
                            daysUntil! < 0
                              ? 'bg-red-500/10 text-red-500'
                              : daysUntil! <= 2
                                ? 'bg-amber-500/10 text-amber-500'
                                : 'bg-base-content/5 text-base-content/30'
                          }`}>
                            <Calendar size={10} />
                            {daysUntil! < 0 ? 'Vencida' : `${daysUntil}d`}
                          </div>
                        </Show>
                        <ChevronRight size={14} class="text-base-content/10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    );
                  }}
                </For>
              </div>
            </section>
          </Show>

          {/* Recurring */}
          <Show when={myRecurring().length > 0}>
            <section>
              <h2 class="text-[10px] font-bold uppercase tracking-widest text-base-content/30 mb-3">HUs recurrentes</h2>
              <div class="space-y-2">
                <For each={myRecurring()}>
                  {(story) => (
                    <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-base-200/60">
                      <Repeat size={14} class="text-ios-blue-500/50 shrink-0" />
                      <span class="text-sm flex-1">{story.title}</span>
                      <span class="text-[10px] px-2 py-0.5 rounded-md bg-base-content/5 text-base-content/30">
                        {frequencyLabel[story.frequency!]}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </Show>

          {/* Week Goals */}
          <section>
            <h2 class="text-[10px] font-bold uppercase tracking-widest text-base-content/30 mb-3">Objetivos de la semana</h2>
            <div class="space-y-1.5">
              <For each={myGoals()}>
                {(goal) => (
                  <div class="flex items-center gap-2.5 px-4 py-2.5 rounded-xl hover:bg-base-content/5 transition-colors">
                    <Show when={goal.is_completed} fallback={<Circle size={14} class="text-base-content/15 shrink-0" />}>
                      <CheckCircle size={14} class="text-ios-green-500 shrink-0" />
                    </Show>
                    <span class={`text-sm ${goal.is_completed ? 'line-through text-base-content/25' : ''}`}>
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
          <StoryDetail story={story()} onClose={() => setSelectedStory(null)} />
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
