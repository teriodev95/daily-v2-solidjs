import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import type { Story } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import {
  CheckCircle, Circle, ArrowRight, BookOpen, AlertTriangle,
  Plus, GripVertical, Package, Target, Sparkles,
} from 'lucide-solid';
import StoryDetail from '../components/StoryDetail';
import type { ReportCategory } from '../types';

interface ReportPageProps {
  onCreateStory?: (category: ReportCategory) => void;
  refreshKey?: number;
}

const ReportPage: Component<ReportPageProps> = (props) => {
  const auth = useAuth();
  const data = useData();
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const userId = () => auth.user()?.id ?? '';

  const [reportData] = createResource(
    () => ({ date: today, uid: userId(), _r: props.refreshKey }),
    ({ date }) => api.reports.getByDate(date).catch(() => null),
  );

  const [goalsList] = createResource(userId, (uid) =>
    api.goals.list({ user_id: uid })
  );

  const report = () => reportData();
  const yesterdayStories = () => report()?.yesterday ?? [];
  const todayStories = () => report()?.today ?? [];
  const backlogStories = () => report()?.backlog ?? [];
  const myGoals = () => goalsList() ?? [];

  const getProject = (projectId: string | null) => {
    if (!projectId) return null;
    return data.getProjectById(projectId) ?? null;
  };

  return (
    <>
    <Show when={!reportData.loading} fallback={<ReportSkeleton />}>
    <div class="space-y-6">

      {/* Goals bar (sticky) */}
      <div class="sticky top-12 md:top-12 z-30 -mx-4 lg:-mx-6 px-4 lg:px-6 py-3 bg-base-100/80 backdrop-blur-xl">
        <div class="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
          <div class="w-8 h-8 rounded-full bg-base-content/10 flex items-center justify-center shrink-0">
            <Target size={16} class="text-base-content/50" />
          </div>
          <For each={myGoals()}>
            {(goal) => (
              <div class={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm whitespace-nowrap border transition-all shrink-0 ${
                goal.is_completed
                  ? 'bg-base-content/5 text-base-content/30 line-through border-transparent'
                  : 'bg-base-200/80 border-base-300/50'
              }`}>
                <Show when={goal.is_completed} fallback={<Circle size={14} class="text-base-content/20" />}>
                  <CheckCircle size={14} class="text-ios-green-500" />
                </Show>
                {goal.text}
              </div>
            )}
          </For>
          <button class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm text-base-content/25 border border-dashed border-base-300/50 whitespace-nowrap hover:bg-base-content/5 transition-all shrink-0">
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Two columns: Ayer + Hoy */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Yesterday */}
        <section>
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 rounded-full bg-ios-green-500/10 flex items-center justify-center">
              <CheckCircle size={18} class="text-ios-green-500" />
            </div>
            <div>
              <h2 class="text-sm font-bold">¿Qué logré ayer?</h2>
              <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Reconoce tus avances</p>
            </div>
          </div>
          <div class="space-y-2">
            <For each={yesterdayStories()}>
              {(story) => {
                const proj = getProject(story.project_id);
                return (
                  <button onClick={() => setSelectedStory(story)} class="w-full text-left group flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/60 hover:bg-base-200 transition-all cursor-pointer">
                    <GripVertical size={14} class="text-base-content/10 shrink-0 cursor-grab" />
                    <span class="text-sm flex-1">{story.title}</span>
                    <Show when={story.code}>
                      <span
                        class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ "background-color": `${proj?.color ?? '#525252'}15`, color: proj?.color ?? '#525252' }}
                      >
                        {story.code}
                      </span>
                    </Show>
                    <Show when={!story.code && proj}>
                      <span
                        class="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ "background-color": `${proj!.color}15`, color: proj!.color }}
                      >
                        {proj!.prefix}
                      </span>
                    </Show>
                  </button>
                );
              }}
            </For>
            <button
              onClick={() => props.onCreateStory?.('yesterday')}
              class="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm text-base-content/20 bg-base-200/30 hover:bg-base-200/50 transition-all"
            >
              <Plus size={14} />
              ¿Algo más que logré?
            </button>
          </div>
        </section>

        {/* Today */}
        <section>
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 rounded-full bg-ios-blue-500/10 flex items-center justify-center">
              <ArrowRight size={18} class="text-ios-blue-500" />
            </div>
            <div>
              <h2 class="text-sm font-bold">¿En qué me enfocaré hoy?</h2>
              <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Define tus prioridades</p>
            </div>
          </div>
          <div class="space-y-2">
            <For each={todayStories()}>
              {(story) => {
                const proj = getProject(story.project_id);
                return (
                  <button onClick={() => setSelectedStory(story)} class="w-full text-left group flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/60 hover:bg-base-200 transition-all cursor-pointer">
                    <GripVertical size={14} class="text-base-content/10 shrink-0 cursor-grab" />
                    <span class="text-sm flex-1">{story.title}</span>
                    <Show when={story.code}>
                      <span
                        class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ "background-color": `${proj?.color ?? '#525252'}15`, color: proj?.color ?? '#525252' }}
                      >
                        {story.code}
                      </span>
                    </Show>
                    <Show when={!story.code && proj}>
                      <span
                        class="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ "background-color": `${proj!.color}15`, color: proj!.color }}
                      >
                        {proj!.prefix}
                      </span>
                    </Show>
                    <Show when={story.status === 'in_progress'}>
                      <Sparkles size={12} class="text-ios-blue-500/50 shrink-0" />
                    </Show>
                  </button>
                );
              }}
            </For>
            <button
              onClick={() => props.onCreateStory?.('today')}
              class="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm text-base-content/20 bg-base-200/30 hover:bg-base-200/50 transition-all"
            >
              <Plus size={14} />
              ¿Otra prioridad para hoy?
            </button>
          </div>
        </section>
      </div>

      {/* Pila de tareas */}
      <section>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center">
            <Package size={18} class="text-orange-500" />
          </div>
          <div>
            <h2 class="text-sm font-bold">Pila de tareas</h2>
            <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Tareas para después</p>
          </div>
        </div>
        <div class="space-y-2">
          <For each={backlogStories()}>
            {(story) => {
              const proj = getProject(story.project_id);
              return (
                <button onClick={() => setSelectedStory(story)} class="w-full text-left group flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/60 hover:bg-base-200 transition-all cursor-pointer">
                  <GripVertical size={14} class="text-base-content/10 shrink-0 cursor-grab" />
                  <span class="text-sm text-base-content/50 flex-1">{story.title}</span>
                  <Show when={story.code}>
                    <span
                      class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{ "background-color": `${proj?.color ?? '#525252'}15`, color: proj?.color ?? '#525252' }}
                    >
                      {story.code}
                    </span>
                  </Show>
                  <Show when={!story.code && proj}>
                    <span
                      class="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ "background-color": `${proj!.color}15`, color: proj!.color }}
                    >
                      {proj!.prefix}
                    </span>
                  </Show>
                </button>
              );
            }}
          </For>
          <button
            onClick={() => props.onCreateStory?.('backlog')}
            class="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm text-base-content/20 bg-base-200/30 hover:bg-base-200/50 transition-all"
          >
            <Plus size={14} />
            Agregar a la pila...
          </button>
        </div>
      </section>

      {/* Learning */}
      <section>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center">
            <BookOpen size={18} class="text-amber-500" />
          </div>
          <div>
            <h2 class="text-sm font-bold">¿Qué estoy aprendiendo?</h2>
            <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Documenta tu crecimiento</p>
          </div>
        </div>
        <div class="space-y-2">
          <Show when={report()?.learning}>
            <div class="flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/60">
              <Circle size={14} class="text-base-content/15 shrink-0" />
              <span class="text-sm">{report()!.learning}</span>
            </div>
          </Show>
          <button class="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm text-base-content/20 bg-base-200/30 hover:bg-base-200/50 transition-all">
            <Plus size={14} />
            Añadir nuevo aprendizaje...
          </button>
        </div>
      </section>

      {/* Impediments */}
      <section>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle size={18} class="text-red-500" />
          </div>
          <div>
            <h2 class="text-sm font-bold">¿Qué impedimentos tengo?</h2>
            <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Identifica obstáculos</p>
          </div>
        </div>
        <div class="space-y-2">
          <Show when={report()?.impediments}>
            <div class="flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/60">
              <Circle size={14} class="text-base-content/15 shrink-0" />
              <span class="text-sm">{report()!.impediments}</span>
            </div>
          </Show>
          <button class="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm text-base-content/20 bg-base-200/30 hover:bg-base-200/50 transition-all">
            <Plus size={14} />
            Añadir nuevo impedimento...
          </button>
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
  </>
  );
};

const ReportSkeleton: Component = () => (
  <div class="space-y-6 animate-pulse">
    <div class="h-12 rounded-xl bg-base-200/60" />
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="space-y-2">
        <div class="h-12 rounded-xl bg-base-200/60" />
        <div class="h-12 rounded-xl bg-base-200/60" />
      </div>
      <div class="space-y-2">
        <div class="h-12 rounded-xl bg-base-200/60" />
        <div class="h-12 rounded-xl bg-base-200/60" />
      </div>
    </div>
  </div>
);

export default ReportPage;
