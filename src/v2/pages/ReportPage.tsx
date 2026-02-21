import { createSignal, createResource, createEffect, onCleanup, For, Show, type Component } from 'solid-js';
import type { Story, StoryStatus } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import {
  CheckCircle, Circle, ArrowRight, BookOpen, AlertTriangle,
  Plus, Package, Target, Play, RotateCcw, Check,
  Eye, Trash2, ArrowRightCircle,
} from 'lucide-solid';
import StoryDetail from '../components/StoryDetail';
import type { ReportCategory } from '../types';

interface ReportPageProps {
  onCreateStory?: (category: ReportCategory) => void;
  refreshKey?: number;
  onStoryDeleted?: () => void;
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

  const [userStories, { refetch: refetchStories }] = createResource(
    () => ({ uid: userId(), _r: props.refreshKey }),
    ({ uid }) => uid ? api.stories.list({ assignee_id: uid }) : Promise.resolve([]),
  );

  const [goalsList] = createResource(userId, (uid) =>
    api.goals.list({ user_id: uid })
  );

  // Local state for optimistic updates
  const [localStories, setLocalStories] = createSignal<Story[]>([]);
  const [exitingIds, setExitingIds] = createSignal<Set<string>>(new Set());
  const [enteringIds, setEnteringIds] = createSignal<Set<string>>(new Set());

  createEffect(() => {
    const fetched = userStories();
    if (fetched) setLocalStories(fetched as Story[]);
  });

  const report = () => reportData();

  // Date helpers
  const yesterdayRange = () => {
    const now = new Date();
    const day = now.getDay();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (day === 1) {
      const satStart = new Date(todayStart);
      satStart.setDate(satStart.getDate() - 2);
      return { start: satStart, end: todayStart, isWeekend: true };
    }
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    return { start: yesterdayStart, end: todayStart, isWeekend: false };
  };

  const todayStartDate = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  // Filtered lists
  const completedYesterday = () => {
    const { start, end } = yesterdayRange();
    return localStories().filter(s => {
      if (s.status !== 'done' || !s.completed_at) return false;
      const d = new Date(s.completed_at);
      return d >= start && d < end;
    });
  };

  const completedToday = () => {
    const start = todayStartDate();
    return localStories().filter(s => {
      if (s.status !== 'done' || !s.completed_at) return false;
      return new Date(s.completed_at) >= start;
    });
  };

  const todayStories = () => localStories().filter(s => s.status === 'in_progress');
  const backlogStories = () => localStories().filter(s => s.status === 'todo' || s.status === 'backlog');
  const myGoals = () => goalsList() ?? [];

  const getProject = (projectId: string | null) => {
    if (!projectId) return null;
    return data.getProjectById(projectId) ?? null;
  };

  const formatCompletedDay = (dateStr: string) => {
    const d = new Date(dateStr);
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    return days[d.getDay()];
  };

  // Animated move with exit → enter transition
  const moveStory = (storyId: string, newStatus: StoryStatus) => {
    const now = new Date().toISOString();

    // Step 1: Play exit animation
    setExitingIds(prev => new Set([...prev, storyId]));

    // Step 2: After exit animation, update state and play enter
    setTimeout(() => {
      setExitingIds(prev => { const n = new Set(prev); n.delete(storyId); return n; });
      setEnteringIds(prev => new Set([...prev, storyId]));

      setLocalStories(prev => prev.map(s =>
        s.id === storyId
          ? { ...s, status: newStatus, completed_at: newStatus === 'done' ? now : null } as Story
          : s
      ));

      // Clear enter animation after it completes
      setTimeout(() => {
        setEnteringIds(prev => { const n = new Set(prev); n.delete(storyId); return n; });
      }, 260);
    }, 190);

    // Background API sync (fire immediately)
    const payload: Record<string, unknown> = { status: newStatus };
    payload.completed_at = newStatus === 'done' ? now : null;
    api.stories.update(storyId, payload).catch(() => refetchStories());
  };

  const cardClass = (storyId: string) =>
    exitingIds().has(storyId) ? 'animate-card-exit' :
    enteringIds().has(storyId) ? 'animate-card-enter' : '';

  // ─── Context menu ───
  const [ctxMenu, setCtxMenu] = createSignal<{ story: Story; x: number; y: number } | null>(null);

  const openCtxMenu = (e: MouseEvent, story: Story) => {
    e.preventDefault();
    const menuW = 200;
    const menuH = 280;
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuW - 8));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - menuH - 8));
    setCtxMenu({ story, x, y });
  };

  const closeCtxMenu = () => setCtxMenu(null);

  const ctxMoveAndClose = (storyId: string, status: StoryStatus) => {
    closeCtxMenu();
    moveStory(storyId, status);
  };

  // ─── Delete with undo toast ───
  let deleteTimer: ReturnType<typeof setTimeout> | null = null;
  const [deletePending, setDeletePending] = createSignal<{ story: Story } | null>(null);
  const [toastExiting, setToastExiting] = createSignal(false);

  const dismissToast = (then: () => void) => {
    setToastExiting(true);
    setTimeout(() => {
      setToastExiting(false);
      setDeletePending(null);
      then();
    }, 180);
  };

  const ctxDelete = (story: Story) => {
    closeCtxMenu();

    // Exit animation then remove from list
    setExitingIds(prev => new Set([...prev, story.id]));
    setTimeout(() => {
      setExitingIds(prev => { const n = new Set(prev); n.delete(story.id); return n; });
      setLocalStories(prev => prev.filter(s => s.id !== story.id));
    }, 190);

    // Show undo toast
    setToastExiting(false);
    setDeletePending({ story });

    // Schedule actual delete after 4s
    if (deleteTimer) clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => {
      dismissToast(() => {
        api.stories.delete(story.id).catch(() => {});
      });
      deleteTimer = null;
    }, 4000);
  };

  const undoDelete = () => {
    const pending = deletePending();
    if (!pending) return;
    if (deleteTimer) { clearTimeout(deleteTimer); deleteTimer = null; }

    dismissToast(() => {
      // Restore story with enter animation
      setEnteringIds(prev => new Set([...prev, pending.story.id]));
      setLocalStories(prev => [...prev, pending.story]);
      setTimeout(() => {
        setEnteringIds(prev => { const n = new Set(prev); n.delete(pending.story.id); return n; });
      }, 260);
    });
  };

  onCleanup(() => { if (deleteTimer) clearTimeout(deleteTimer); });

  // Close context menu on outside click or Escape
  const handleGlobalClick = () => { if (ctxMenu()) closeCtxMenu(); };
  const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCtxMenu(); };

  if (typeof document !== 'undefined') {
    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('keydown', handleEsc);
    onCleanup(() => {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleEsc);
    });
  }

  // Status move options for context menu
  const statusOptions = (current: StoryStatus): { label: string; status: StoryStatus; icon: any; color: string }[] => {
    const opts: { label: string; status: StoryStatus; icon: any; color: string }[] = [];
    if (current !== 'in_progress') opts.push({ label: 'En progreso', status: 'in_progress', icon: Play, color: 'text-ios-blue-500' });
    if (current !== 'todo' && current !== 'backlog') opts.push({ label: 'Por hacer', status: 'todo', icon: Package, color: 'text-orange-500' });
    if (current !== 'done') opts.push({ label: 'Completada', status: 'done', icon: Check, color: 'text-ios-green-500' });
    return opts;
  };

  // Reusable story badge
  const ProjectBadge = (p: { story: Story }) => {
    const proj = getProject(p.story.project_id);
    return (
      <>
        <Show when={p.story.code}>
          <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ "background-color": `${proj?.color ?? '#525252'}15`, color: proj?.color ?? '#525252' }}>{p.story.code}</span>
        </Show>
        <Show when={!p.story.code && proj}>
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ "background-color": `${proj!.color}15`, color: proj!.color }}>{proj!.prefix}</span>
        </Show>
      </>
    );
  };

  return (
    <>
    <Show when={!reportData.loading && !userStories.loading} fallback={<ReportSkeleton />}>
    <div class="space-y-6">

      {/* Goals bar (sticky) */}
      <div class="sticky top-14 md:top-16 z-30 -mx-4 lg:-mx-6 px-4 lg:px-6 py-3 bg-base-100/80 backdrop-blur-xl">
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

      {/* Two columns: Completado + Hoy */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Completed */}
        <section>
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 rounded-full bg-ios-green-500/10 flex items-center justify-center">
              <CheckCircle size={18} class="text-ios-green-500" />
            </div>
            <div>
              <h2 class="text-sm font-bold">Trabajo completado</h2>
              <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Tareas finalizadas</p>
            </div>
          </div>
          <div class="space-y-2">
            {/* Today's completions */}
            <For each={completedToday()}>
              {(story) => (
                <div onContextMenu={(e) => openCtxMenu(e, story)} class={`flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/60 group ${cardClass(story.id)}`}>
                  <button
                    onClick={() => moveStory(story.id, 'in_progress')}
                    class="p-1.5 rounded-md text-base-content/15 sm:text-base-content/0 group-hover:text-base-content/20 hover:!text-amber-500 hover:!bg-amber-500/10 transition-all shrink-0"
                    title="Reabrir"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button onClick={() => setSelectedStory(story)} class="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <span class="text-sm text-base-content/40 line-through flex-1 truncate">{story.title}</span>
                    <ProjectBadge story={story} />
                  </button>
                  <span class="text-[9px] text-base-content/15 shrink-0">hoy</span>
                </div>
              )}
            </For>
            {/* Yesterday's completions */}
            <Show when={completedYesterday().length > 0}>
              <Show when={completedToday().length > 0}>
                <div class="flex items-center gap-2 py-1">
                  <div class="flex-1 h-px bg-base-content/5" />
                  <span class="text-[9px] text-base-content/15 uppercase">
                    {yesterdayRange().isWeekend ? 'fin de semana' : 'ayer'}
                  </span>
                  <div class="flex-1 h-px bg-base-content/5" />
                </div>
              </Show>
              <For each={completedYesterday()}>
                {(story) => {
                  const proj = getProject(story.project_id);
                  return (
                    <button onContextMenu={(e) => openCtxMenu(e, story)} onClick={() => setSelectedStory(story)} class="w-full text-left flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/40 hover:bg-base-200/60 transition-all cursor-pointer">
                      <CheckCircle size={13} class="text-ios-green-500/30 shrink-0" />
                      <span class="text-sm text-base-content/30 flex-1 truncate">{story.title}</span>
                      <Show when={yesterdayRange().isWeekend && story.completed_at}>
                        <span class="text-[9px] text-base-content/15 capitalize">{formatCompletedDay(story.completed_at!)}</span>
                      </Show>
                      <Show when={story.code}>
                        <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ "background-color": `${proj?.color ?? '#525252'}10`, color: `${proj?.color ?? '#525252'}80` }}>{story.code}</span>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </Show>
            <Show when={completedToday().length === 0 && completedYesterday().length === 0}>
              <div class="px-3 py-4 rounded-xl bg-base-200/30 text-center">
                <span class="text-sm text-base-content/20">Sin tareas completadas</span>
              </div>
            </Show>
          </div>
        </section>

        {/* Today - in progress */}
        <section>
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 rounded-full bg-ios-blue-500/10 flex items-center justify-center">
              <ArrowRight size={18} class="text-ios-blue-500" />
            </div>
            <div>
              <h2 class="text-sm font-bold">¿En qué me enfocaré hoy?</h2>
              <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">En progreso</p>
            </div>
          </div>
          <div class="space-y-2">
            <For each={todayStories()}>
              {(story) => (
                <div onContextMenu={(e) => openCtxMenu(e, story)} class={`flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/60 group ${cardClass(story.id)}`}>
                  <button
                    onClick={() => moveStory(story.id, 'done')}
                    class="p-1.5 rounded-md text-base-content/15 hover:text-ios-green-500 hover:bg-ios-green-500/10 transition-all shrink-0"
                    title="Marcar completada"
                  >
                    <Check size={14} />
                  </button>
                  <button onClick={() => setSelectedStory(story)} class="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <span class="text-sm flex-1 truncate">{story.title}</span>
                    <ProjectBadge story={story} />
                  </button>
                </div>
              )}
            </For>
            <Show when={todayStories().length === 0}>
              <div class="px-3 py-4 rounded-xl bg-base-200/30 text-center">
                <span class="text-sm text-base-content/20">Mueve tareas aquí desde la pila</span>
              </div>
            </Show>
          </div>
        </section>
      </div>

      {/* Pila de tareas - todo + backlog */}
      <section>
        <div class="flex items-center gap-3 mb-4">
          <div class="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center">
            <Package size={18} class="text-orange-500" />
          </div>
          <div>
            <h2 class="text-sm font-bold">Pila de tareas</h2>
            <p class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25">Por hacer</p>
          </div>
        </div>
        <div class="space-y-2">
          <For each={backlogStories()}>
            {(story) => (
              <div onContextMenu={(e) => openCtxMenu(e, story)} class={`flex items-center gap-2 px-3 py-3 rounded-xl bg-base-200/60 group ${cardClass(story.id)}`}>
                <button
                  onClick={() => moveStory(story.id, 'in_progress')}
                  class="p-1.5 rounded-md text-base-content/15 hover:text-ios-blue-500 hover:bg-ios-blue-500/10 transition-all shrink-0"
                  title="Empezar a trabajar"
                >
                  <Play size={14} />
                </button>
                <button onClick={() => setSelectedStory(story)} class="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <span class="text-sm text-base-content/50 flex-1 truncate">{story.title}</span>
                  <ProjectBadge story={story} />
                </button>
              </div>
            )}
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

    {/* Context menu */}
    <Show when={ctxMenu()}>
      {(menu) => {
        const s = menu().story;
        const moves = statusOptions(s.status as StoryStatus);
        return (
          <div
            class="fixed z-[100] min-w-[180px] py-1.5 rounded-xl bg-base-100 border border-base-content/[0.08] shadow-xl shadow-black/20 animate-ctx-menu"
            style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title */}
            <div class="px-3 py-1.5 text-[10px] font-semibold text-base-content/30 uppercase tracking-wider truncate">
              {s.code || s.title.slice(0, 24)}
            </div>

            {/* Open */}
            <button
              onClick={() => { closeCtxMenu(); setSelectedStory(s); }}
              class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-sm text-base-content/70 hover:bg-base-content/5 transition-colors"
            >
              <Eye size={14} class="shrink-0" />
              Abrir detalle
            </button>

            {/* Separator */}
            <div class="my-1 h-px bg-base-content/[0.06] mx-2" />

            {/* Move options */}
            <div class="px-2 py-1">
              <span class="px-1 text-[9px] font-semibold text-base-content/20 uppercase tracking-wider">Mover a</span>
            </div>
            <For each={moves}>
              {(opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    onClick={() => ctxMoveAndClose(s.id, opt.status)}
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-sm hover:bg-base-content/5 transition-colors"
                  >
                    <Icon size={14} class={`shrink-0 ${opt.color}`} />
                    <span>{opt.label}</span>
                  </button>
                );
              }}
            </For>

            {/* Separator */}
            <div class="my-1 h-px bg-base-content/[0.06] mx-2" />

            {/* Delete (undo via toast) */}
            <button
              onClick={() => ctxDelete(s)}
              class="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-sm text-red-500/60 hover:text-red-500 hover:bg-red-500/5 transition-colors"
            >
              <Trash2 size={14} class="shrink-0" />
              Eliminar
            </button>
          </div>
        );
      }}
    </Show>

    {/* Undo delete toast */}
    <Show when={deletePending()}>
      {() => (
        <div class={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[110] max-w-sm w-[calc(100%-2rem)] sm:w-auto ${toastExiting() ? 'animate-toast-out' : 'animate-toast-in'}`}>
          <div class="flex items-center gap-3 px-4 py-3 rounded-2xl bg-base-300 border border-base-content/[0.08] shadow-xl shadow-black/20 backdrop-blur-xl">
            <Trash2 size={14} class="text-red-500/60 shrink-0" />
            <span class="text-sm text-base-content/70 whitespace-nowrap">HU eliminada</span>
            <button
              onClick={undoDelete}
              class="text-sm font-semibold text-ios-blue-500 hover:text-ios-blue-400 transition-colors whitespace-nowrap"
            >
              Deshacer
            </button>
          </div>
        </div>
      )}
    </Show>

    {/* Story Detail Modal */}
    <Show when={selectedStory()}>
      {(story) => (
        <StoryDetail
          story={story()}
          onClose={() => setSelectedStory(null)}
          onDeleted={() => { setSelectedStory(null); props.onStoryDeleted?.(); }}
          onUpdated={(id, fields) => {
            setLocalStories(prev => prev.map(s => s.id === id ? { ...s, ...fields } as Story : s));
          }}
        />
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
