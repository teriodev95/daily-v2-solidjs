import { createResource, For, Show, type Component } from 'solid-js';
import type { Story, Assignment } from '../types';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import {
  CheckCircle, Circle, ArrowRight, BookOpen, AlertTriangle,
  Package, Target, Flag,
} from 'lucide-solid';

interface Props {
  memberId: string;
  onStoryClick?: (story: Story) => void;
}

const MemberReportPreview: Component<Props> = (props) => {
  const data = useData();

  const today = new Date().toISOString().split('T')[0];

  const [stories] = createResource(
    () => props.memberId,
    (uid) => api.stories.list({ assignee_id: uid }),
  );

  const [reportData] = createResource(
    () => ({ date: today, uid: props.memberId }),
    ({ date, uid }) => api.reports.getByDate(date, uid).catch(() => null),
  );

  const [goals] = createResource(
    () => props.memberId,
    (uid) => api.goals.list({ user_id: uid }),
  );

  const [assignments] = createResource(
    () => props.memberId,
    (uid) => api.assignments.list({ assigned_to: uid, status: 'open' }),
  );

  const allStories = () => (stories() ?? []) as Story[];

  // Date helpers
  const yesterdayRange = () => {
    const now = new Date();
    const day = now.getDay();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (day === 1) {
      const satStart = new Date(todayStart);
      satStart.setDate(satStart.getDate() - 2);
      return { start: satStart, end: todayStart };
    }
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    return { start: yesterdayStart, end: todayStart };
  };

  const todayStart = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const completedRecent = () => {
    const { start } = yesterdayRange();
    return allStories().filter(s => {
      if (s.status !== 'done' || !s.completed_at) return false;
      return new Date(s.completed_at) >= start;
    });
  };

  const activeWork = () => allStories().filter(s => s.status === 'in_progress' || s.status === 'todo');
  const backlog = () => allStories().filter(s => s.status === 'backlog');
  const myGoals = () => goals() ?? [];
  const myAssignments = () => (assignments() ?? []) as Assignment[];
  const report = () => reportData();

  const member = () => data.getUserById(props.memberId);

  const getProject = (projectId: string | null) => {
    if (!projectId) return null;
    return data.getProjectById(projectId) ?? null;
  };

  const loading = () => stories.loading || goals.loading;

  return (
    <Show when={!loading()} fallback={
      <div class="rounded-2xl bg-base-100/60 border border-base-content/[0.04] p-6 animate-pulse space-y-4">
        <div class="h-4 w-32 rounded bg-base-200/60" />
        <div class="h-4 w-48 rounded bg-base-200/60" />
        <div class="h-4 w-40 rounded bg-base-200/60" />
      </div>
    }>
      <div class="rounded-2xl bg-base-100/60 border border-base-content/[0.04] overflow-hidden animate-member-panel">

        {/* Header */}
        <div class="flex items-center gap-4 px-5 py-4 border-b border-base-content/[0.04] bg-base-200/30">
          <img src={member()?.avatar_url!} alt="" class="w-10 h-10 rounded-full ring-2 ring-base-100 shadow-sm" />
          <div class="flex-1 min-w-0">
            <p class="text-base font-bold text-base-content/90 truncate">{member()?.name}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[10px] uppercase tracking-widest font-bold text-base-content/30">{member()?.role === 'admin' ? 'Admin' : 'Colaborador'}</span>
              <span class="w-1 h-1 rounded-full bg-base-content/20" />
              <span class="text-[11px] font-medium text-base-content/50">{activeWork().length} activas</span>
            </div>
          </div>
        </div>

        <div class="p-5 space-y-5">

          {/* Goals */}
          <Show when={myGoals().length > 0}>
            <div>
              <p class="flex items-center gap-1.5 text-[10px] font-bold uppercase text-base-content/30 tracking-[0.1em] mb-2">
                <Target size={11} /> Objetivos
              </p>
              <div class="flex flex-wrap gap-1.5">
                <For each={myGoals()}>
                  {(goal) => (
                    <span class={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${
                      goal.is_completed
                        ? 'bg-base-content/[0.03] text-base-content/25 line-through'
                        : 'bg-base-200/80 text-base-content/60'
                    }`}>
                      <Show when={goal.is_completed} fallback={<Circle size={10} class="text-base-content/20" />}>
                        <CheckCircle size={10} class="text-ios-green-500" />
                      </Show>
                      {goal.text}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Two columns: Completado + Hoy */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Completed */}
            <div>
              <p class="flex items-center gap-1.5 text-[10px] font-bold uppercase text-base-content/30 tracking-[0.1em] mb-2">
                <CheckCircle size={11} class="text-ios-green-500" /> Completado
                <span class="text-base-content/15 ml-auto">{completedRecent().length}</span>
              </p>
              <div class="space-y-1">
                <For each={completedRecent()}>
                  {(story) => {
                    const proj = getProject(story.project_id);
                    return (
                      <button onClick={() => props.onStoryClick?.(story)} class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-base-200/40 hover:bg-base-200/70 transition-colors text-left">
                        <CheckCircle size={12} class="text-ios-green-500/30 shrink-0" />
                        <span class="text-[12px] text-base-content/35 line-through flex-1 truncate">{story.title}</span>
                        <Show when={story.code}>
                          <span class="text-[8px] font-mono font-bold px-1 py-0.5 rounded shrink-0" style={{ "background-color": `${proj?.color ?? '#525252'}10`, color: `${proj?.color ?? '#525252'}60` }}>{story.code}</span>
                        </Show>
                      </button>
                    );
                  }}
                </For>
                <Show when={completedRecent().length === 0}>
                  <p class="text-[11px] text-base-content/20 px-2.5 py-2">Sin tareas completadas</p>
                </Show>
              </div>
            </div>

            {/* Active work */}
            <div>
              <p class="flex items-center gap-1.5 text-[10px] font-bold uppercase text-base-content/30 tracking-[0.1em] mb-2">
                <ArrowRight size={11} class="text-ios-blue-500" /> Trabajo activo
                <span class="text-base-content/15 ml-auto">{activeWork().length}</span>
              </p>
              <div class="space-y-1">
                <For each={activeWork()}>
                  {(story) => {
                    const proj = getProject(story.project_id);
                    return (
                      <button onClick={() => props.onStoryClick?.(story)} class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-base-200/40 hover:bg-base-200/70 transition-colors text-left">
                        <Circle size={12} class="text-ios-blue-500/40 shrink-0" />
                        <span class="text-[12px] text-base-content/70 flex-1 truncate">{story.title}</span>
                        <Show when={story.code}>
                          <span class="text-[8px] font-mono font-bold px-1 py-0.5 rounded shrink-0" style={{ "background-color": `${proj?.color ?? '#525252'}15`, color: proj?.color ?? '#525252' }}>{story.code}</span>
                        </Show>
                        <Show when={story.status === 'in_progress'}>
                          <span class="relative flex h-1.5 w-1.5 shrink-0">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-ios-blue-500 opacity-50" />
                            <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-ios-blue-500" />
                          </span>
                        </Show>
                      </button>
                    );
                  }}
                </For>
                <Show when={activeWork().length === 0}>
                  <p class="text-[11px] text-base-content/20 px-2.5 py-2">Sin tareas activas</p>
                </Show>
              </div>
            </div>
          </div>

          {/* Backlog */}
          <Show when={backlog().length > 0}>
            <div>
              <p class="flex items-center gap-1.5 text-[10px] font-bold uppercase text-base-content/30 tracking-[0.1em] mb-2">
                <Package size={11} class="text-base-content/40" /> Backlog
                <span class="text-base-content/15 ml-auto">{backlog().length}</span>
              </p>
              <div class="space-y-1">
                <For each={backlog()}>
                  {(story) => (
                    <button onClick={() => props.onStoryClick?.(story)} class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-base-200/40 hover:bg-base-200/70 transition-colors text-left">
                      <Circle size={12} class="text-base-content/15 shrink-0" />
                      <span class="text-[12px] text-base-content/40 flex-1 truncate">{story.title}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Assignments */}
          <Show when={myAssignments().length > 0}>
            <div>
              <p class="flex items-center gap-1.5 text-[10px] font-bold uppercase text-base-content/30 tracking-[0.1em] mb-2">
                <Flag size={11} class="text-purple-500" /> Encomiendas
                <span class="text-base-content/15 ml-auto">{myAssignments().length}</span>
              </p>
              <div class="space-y-1">
                <For each={myAssignments()}>
                  {(a) => {
                    const assigner = data.getUserById(a.assigned_by);
                    return (
                      <div class="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-base-200/40">
                        <Circle size={12} class="text-purple-500/30 shrink-0" />
                        <span class="text-[12px] text-base-content/60 flex-1 truncate">{a.title}</span>
                        <Show when={assigner}>
                          <img src={assigner!.avatar_url!} alt="" class="w-4 h-4 rounded-full shrink-0" title={`De ${assigner!.name}`} />
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>

          {/* Learning + Impediments */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p class="flex items-center gap-1.5 text-[10px] font-bold uppercase text-base-content/30 tracking-[0.1em] mb-2">
                <BookOpen size={11} class="text-amber-500" /> Aprendizaje
              </p>
              <Show when={report()?.learning} fallback={<p class="text-[11px] text-base-content/15">—</p>}>
                <p class="text-[12px] text-base-content/50 leading-relaxed">{report()!.learning}</p>
              </Show>
            </div>
            <div>
              <p class="flex items-center gap-1.5 text-[10px] font-bold uppercase text-base-content/30 tracking-[0.1em] mb-2">
                <AlertTriangle size={11} class="text-red-500" /> Impedimentos
              </p>
              <Show when={report()?.impediments} fallback={<p class="text-[11px] text-base-content/15">—</p>}>
                <p class="text-[12px] text-base-content/50 leading-relaxed">{report()!.impediments}</p>
              </Show>
            </div>
          </div>

        </div>
      </div>
    </Show>
  );
};

export default MemberReportPreview;
