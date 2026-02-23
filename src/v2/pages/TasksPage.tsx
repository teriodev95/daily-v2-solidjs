import {
  createSignal, createResource, createEffect, For, Show, batch,
  type Component,
} from 'solid-js';
import type { Story, StoryStatus, Project } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import StoryDetail from '../components/StoryDetail';
import { shouldShowRecurringInActive, toLocalDateStr } from '../lib/recurrence';
import {
  CheckCircle2, Star, ChevronDown, ChevronUp,
  FolderKanban, CalendarDays, UserCircle, ArrowUp,
  RefreshCw, Archive, ArrowUpFromLine,
} from 'lucide-solid';

interface TasksPageProps {
  refreshKey?: number;
}

const TasksPage: Component<TasksPageProps> = (props) => {
  const auth = useAuth();
  const data = useData();

  const [localStories, setLocalStories] = createSignal<Story[]>([]);
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);

  // Quick-add state
  const [newTitle, setNewTitle] = createSignal('');
  const [selectedProject, setSelectedProject] = createSignal<string | null>(null);
  const [selectedDate, setSelectedDate] = createSignal<string | null>(null);
  const [selectedAssignee, setSelectedAssignee] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [justCreated, setJustCreated] = createSignal(false);
  const [justCreatedTitle, setJustCreatedTitle] = createSignal('');

  // Collapse states
  const [backlogCollapsed, setBacklogCollapsed] = createSignal(false);

  let inputRef!: HTMLInputElement;
  let dateInputRef!: HTMLInputElement;

  // Fetch stories assigned to me
  const [stories, { refetch }] = createResource(
    () => ({ uid: auth.user()?.id, _r: props.refreshKey }),
    ({ uid }) => uid ? api.stories.list({ assignee_id: uid }) : Promise.resolve([]),
  );

  // Sync to local state
  createEffect(() => {
    const fetched = stories();
    if (fetched) setLocalStories(fetched as Story[]);
  });

  const activeStories = () =>
    localStories()
      .filter(s => (s.status === 'in_progress' || s.status === 'todo') && shouldShowRecurringInActive(s))
      .sort((a, b) => {
        // in_progress first, then todo
        if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
        if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
        // then by priority
        const p = { critical: 0, high: 1, medium: 2, low: 3 };
        return (p[a.priority] ?? 2) - (p[b.priority] ?? 2);
      });

  const backlogStories = () =>
    localStories()
      .filter(s => s.status === 'backlog')
      .sort((a, b) => {
        const p = { critical: 0, high: 1, medium: 2, low: 3 };
        return (p[a.priority] ?? 2) - (p[b.priority] ?? 2);
      });

  // Toggle story completion
  const toggleDone = async (story: Story) => {
    const wasDone = story.status === 'done';
    const newStatus: StoryStatus = wasDone ? 'todo' : 'done';
    const completedAt = wasDone ? null : new Date().toISOString();

    // Haptic feedback
    navigator.vibrate?.(wasDone ? 5 : 15);

    // Optimistic
    setLocalStories(prev =>
      prev.map(s => s.id === story.id ? { ...s, status: newStatus, completed_at: completedAt } : s)
    );

    try {
      await api.stories.update(story.id, { status: newStatus });
    } catch {
      setLocalStories(prev =>
        prev.map(s => s.id === story.id ? { ...s, status: story.status, completed_at: story.completed_at } : s)
      );
    }
  };

  // Move between statuses (backlog <-> todo)
  const moveToStatus = async (story: Story, newStatus: StoryStatus) => {
    const oldStatus = story.status;
    if (oldStatus === newStatus) return;

    navigator.vibrate?.(8);

    // Optimistic
    setLocalStories(prev =>
      prev.map(s => s.id === story.id ? { ...s, status: newStatus } : s)
    );

    try {
      await api.stories.update(story.id, { status: newStatus });
    } catch {
      setLocalStories(prev =>
        prev.map(s => s.id === story.id ? { ...s, status: oldStatus } : s)
      );
    }
  };

  // Quick-create
  const createTask = async () => {
    const title = newTitle().trim();
    if (!title || creating()) return;

    setCreating(true);
    try {
      const created = await api.stories.create({
        title,
        status: 'todo',
        priority: 'medium',
        project_id: selectedProject() || undefined,
        assignee_id: selectedAssignee() || auth.user()?.id,
        due_date: selectedDate() || undefined,
        category: 'today',
      });

      setLocalStories(prev => [created as Story, ...prev]);

      // Feedback: haptic + toast
      navigator.vibrate?.(10);
      setJustCreatedTitle(title);
      setJustCreated(true);
      setTimeout(() => setJustCreated(false), 2000);

      batch(() => {
        setNewTitle('');
        setSelectedProject(null);
        setSelectedDate(null);
        setSelectedAssignee(null);
      });
      inputRef?.focus();
    } catch (e) {
      console.error('Error creating task:', e);
    } finally {
      setCreating(false);
    }
  };

  const handleInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && newTitle().trim()) {
      e.preventDefault();
      createTask();
    }
    if (e.key === 'Escape') {
      inputRef?.blur();
    }
  };

  // Date helpers
  const todayStr = () => toLocalDateStr(new Date());
  const tomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toLocalDateStr(d);
  };
  const nextMondayStr = () => {
    const d = new Date();
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : (8 - day);
    d.setDate(d.getDate() + daysUntilMonday);
    return toLocalDateStr(d);
  };

  const formatDateChip = (dateStr: string) => {
    const t = todayStr();
    const tm = tomorrowStr();
    if (dateStr === t) return 'Hoy';
    if (dateStr === tm) return 'Mañana';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  const activeProjects = () => data.projects().filter(p => p.status === 'active');
  const teamMembers = () => data.users().filter(u => u.is_active);

  const getProject = (projectId: string | null) => {
    if (!projectId) return null;
    return data.getProjectById(projectId) ?? null;
  };

  return (
    <div class="flex flex-col pt-10">
      {/* Header */}
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-base-content/90">Mis Tareas</h1>
          <p class="text-[11px] font-medium text-base-content/30 mt-0.5">
            {activeStories().length} activas · {backlogStories().length} en backlog
          </p>
        </div>
      </div>

      {/* Scrollable list */}
      <div class="space-y-5 pb-[420px]">

        {/* Active (in_progress + todo) */}
        <section>
          <div class="flex items-center gap-2 mb-2 px-1">
            <div class="w-2 h-2 rounded-full bg-ios-blue-500" />
            <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/30">
              En curso
            </span>
            <span class="text-[10px] font-bold text-base-content/15 ml-auto">{activeStories().length}</span>
          </div>
          <div class="space-y-1">
            <For each={activeStories()}>
              {(story) => (
                <TaskRow
                  story={story}
                  onToggle={() => toggleDone(story)}
                  onClick={() => setSelectedStory(story)}
                  getProject={getProject}
                  moveAction={{ label: 'backlog', icon: Archive, onMove: () => moveToStatus(story, 'backlog') }}
                />
              )}
            </For>
            <Show when={activeStories().length === 0}>
              <div class="text-center py-8 text-[12px] text-base-content/20 font-medium">
                No hay tareas en curso
              </div>
            </Show>
          </div>
        </section>

        {/* Backlog */}
        <section>
          <button
            onClick={() => setBacklogCollapsed(v => !v)}
            class="flex items-center gap-2 mb-2 px-1 w-full text-left"
          >
            <div class="w-2 h-2 rounded-full bg-base-content/20" />
            <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/30">
              Backlog
            </span>
            <span class="text-[10px] font-bold text-base-content/15 ml-auto mr-1">{backlogStories().length}</span>
            <Show when={backlogCollapsed()} fallback={<ChevronDown size={12} class="text-base-content/20" />}>
              <ChevronUp size={12} class="text-base-content/20" />
            </Show>
          </button>
          <Show when={!backlogCollapsed()}>
            <div class="space-y-1">
              <For each={backlogStories()}>
                {(story) => (
                  <TaskRow
                    story={story}
                    onToggle={() => toggleDone(story)}
                    onClick={() => setSelectedStory(story)}
                    getProject={getProject}
                    moveAction={{ label: 'en curso', icon: ArrowUpFromLine, onMove: () => moveToStatus(story, 'todo') }}
                  />
                )}
              </For>
              <Show when={backlogStories().length === 0}>
                <div class="text-center py-6 text-[12px] text-base-content/20 font-medium">
                  Backlog vacío
                </div>
              </Show>
            </div>
          </Show>
        </section>
      </div>

      {/* ─── Fixed bottom: Quick-add (always expanded) ─── */}
      <div class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 px-3">
        <div class="max-w-lg mx-auto bg-base-200/90 backdrop-blur-2xl rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 overflow-hidden">

          {/* Input row */}
          <div class="flex items-center gap-3 px-4 h-[48px]">
            <div class="w-5 h-5 rounded-full border-2 border-base-content/15 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={newTitle()}
              onInput={(e) => setNewTitle(e.currentTarget.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Agregar una tarea..."
              class="flex-1 bg-transparent outline-none text-[15px] font-medium placeholder:text-base-content/25 text-base-content/80"
            />
            <Show when={newTitle().trim()}>
              <button
                onClick={createTask}
                disabled={creating()}
                class="w-8 h-8 flex items-center justify-center rounded-lg bg-ios-blue-500 text-white shrink-0 transition-all active:scale-90 disabled:opacity-50"
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </Show>
          </div>

          <div class="h-px bg-base-content/[0.06] mx-3" />

          {/* Projects — inline, no label */}
          <div class="px-3 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <FolderKanban size={12} class="text-base-content/20 shrink-0" />
            <For each={activeProjects()}>
              {(proj) => (
                <button
                  onClick={() => setSelectedProject(p => p === proj.id ? null : proj.id)}
                  class={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                    selectedProject() === proj.id
                      ? 'ring-1'
                      : 'bg-base-content/[0.04]'
                  }`}
                  style={selectedProject() === proj.id ? {
                    "background-color": `${proj.color}20`,
                    color: proj.color,
                    "ring-color": `${proj.color}40`,
                  } : {}}
                >
                  <div class="w-2 h-2 rounded-full shrink-0" style={{ "background-color": proj.color }} />
                  {proj.prefix}
                </button>
              )}
            </For>
          </div>

          {/* Date — inline, no label */}
          <div class="px-3 pb-2 flex items-center gap-1.5">
            <CalendarDays size={12} class="text-base-content/20 shrink-0" />
            <button
              onClick={() => setSelectedDate(d => d === todayStr() ? null : todayStr())}
              class={`flex-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-center transition-all active:scale-95 ${
                selectedDate() === todayStr() ? 'bg-ios-blue-500/15 text-ios-blue-500 ring-1 ring-ios-blue-500/30' : 'bg-base-content/[0.04] text-base-content/50'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => setSelectedDate(d => d === tomorrowStr() ? null : tomorrowStr())}
              class={`flex-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-center transition-all active:scale-95 ${
                selectedDate() === tomorrowStr() ? 'bg-ios-blue-500/15 text-ios-blue-500 ring-1 ring-ios-blue-500/30' : 'bg-base-content/[0.04] text-base-content/50'
              }`}
            >
              Mañana
            </button>
            <button
              onClick={() => setSelectedDate(d => d === nextMondayStr() ? null : nextMondayStr())}
              class={`flex-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-center transition-all active:scale-95 ${
                selectedDate() === nextMondayStr() ? 'bg-ios-blue-500/15 text-ios-blue-500 ring-1 ring-ios-blue-500/30' : 'bg-base-content/[0.04] text-base-content/50'
              }`}
            >
              Lunes
            </button>
            <button
              onClick={() => dateInputRef?.showPicker?.()}
              class={`flex-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-center transition-all active:scale-95 ${
                selectedDate() && selectedDate() !== todayStr() && selectedDate() !== tomorrowStr() && selectedDate() !== nextMondayStr()
                  ? 'bg-ios-blue-500/15 text-ios-blue-500 ring-1 ring-ios-blue-500/30'
                  : 'bg-base-content/[0.04] text-base-content/50'
              }`}
            >
              {selectedDate() && selectedDate() !== todayStr() && selectedDate() !== tomorrowStr() && selectedDate() !== nextMondayStr()
                ? formatDateChip(selectedDate()!)
                : 'Otra...'}
            </button>
            <input
              ref={dateInputRef}
              type="date"
              class="sr-only"
              onChange={(e) => {
                if (e.currentTarget.value) setSelectedDate(e.currentTarget.value);
              }}
            />
          </div>

          {/* Assignee — inline avatars, no label */}
          <div class="px-3 pb-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
            <UserCircle size={12} class="text-base-content/20 shrink-0" />
            <For each={teamMembers()}>
              {(member) => {
                const isMe = () => member.id === auth.user()?.id;
                const isSelected = () =>
                  selectedAssignee() === member.id || (!selectedAssignee() && isMe());
                return (
                  <button
                    onClick={() => setSelectedAssignee(isMe() ? null : member.id)}
                    class="flex flex-col items-center gap-0.5 shrink-0 active:scale-95 transition-all"
                  >
                    <Show when={member.avatar_url} fallback={
                      <div class={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold uppercase ${
                        isSelected()
                          ? 'bg-ios-blue-500/15 text-ios-blue-500 ring-2 ring-ios-blue-500/40'
                          : 'bg-base-content/10 text-base-content/40 ring-1 ring-base-content/[0.06]'
                      }`}>
                        {member.name.substring(0, 2)}
                      </div>
                    }>
                      <img
                        src={member.avatar_url!}
                        alt=""
                        class={`w-7 h-7 rounded-full object-cover ${isSelected() ? 'ring-2 ring-ios-blue-500/50' : 'ring-1 ring-base-content/[0.06]'}`}
                      />
                    </Show>
                    <span class={`text-[8px] font-semibold ${
                      isSelected() ? 'text-ios-blue-500' : 'text-base-content/30'
                    }`}>
                      {isMe() ? 'Yo' : member.name.split(' ')[0]}
                    </span>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </div>

      {/* Success toast — subtle confirmation */}
      <Show when={justCreated()}>
        <div class="fixed top-20 left-0 right-0 z-[60] flex justify-center pointer-events-none px-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div class="bg-ios-green-500/90 backdrop-blur-xl text-white px-4 py-2.5 rounded-2xl shadow-lg shadow-ios-green-500/20 flex items-center gap-2 pointer-events-auto">
            <CheckCircle2 size={16} strokeWidth={2.5} />
            <span class="text-[13px] font-semibold truncate max-w-[200px]">{justCreatedTitle()}</span>
            <span class="text-[11px] opacity-75">creada</span>
          </div>
        </div>
      </Show>

      {/* Story Detail Modal */}
      <Show when={selectedStory()}>
        {(story) => (
          <StoryDetail
            story={story()}
            onClose={() => setSelectedStory(null)}
            onDeleted={() => {
              setLocalStories(prev => prev.filter(s => s.id !== story().id));
              setSelectedStory(null);
            }}
            onUpdated={(id, fields) => {
              setLocalStories(prev => prev.map(s => s.id === id ? { ...s, ...fields } as Story : s));
            }}
          />
        )}
      </Show>
    </div>
  );
};

// ─── Task Row Component ──────────────────────────
interface TaskRowProps {
  story: Story;
  onToggle: () => void;
  onClick: () => void;
  getProject: (projectId: string | null) => Project | null;
  moveAction?: { label: string; icon: any; onMove: () => void };
}

const TaskRow: Component<TaskRowProps> = (props) => {
  const isDone = () => props.story.status === 'done';
  const isHighPriority = () => props.story.priority === 'high' || props.story.priority === 'critical';
  const isInProgress = () => props.story.status === 'in_progress';
  const proj = () => props.getProject(props.story.project_id);

  return (
    <div
      class={`flex items-start gap-3 px-3 py-3 rounded-2xl transition-all duration-200 ${
        isDone()
          ? 'bg-base-content/[0.02]'
          : 'bg-base-200/40 hover:bg-base-200/60'
      }`}
    >
      {/* Checkbox — 44x44 tap target */}
      <button
        onClick={(e) => { e.stopPropagation(); props.onToggle(); }}
        class="w-11 h-11 flex items-center justify-center shrink-0 -ml-1 -mt-0.5 rounded-xl active:bg-base-content/[0.06] active:scale-90 transition-all"
      >
        <Show when={isDone()} fallback={
          <div class={`w-[22px] h-[22px] rounded-full border-2 transition-colors ${
            isInProgress() ? 'border-amber-500/50' : 'border-base-content/15'
          }`} />
        }>
          <CheckCircle2 size={22} class="text-ios-green-500" />
        </Show>
      </button>

      {/* Content — tappable to open detail */}
      <button
        onClick={props.onClick}
        class="flex-1 min-w-0 text-left py-0.5"
      >
        <div class="flex items-start gap-2">
          <span class={`text-[14px] font-medium leading-relaxed transition-colors ${
            isDone()
              ? 'text-base-content/30 line-through'
              : 'text-base-content/80'
          }`}>
            <Show when={props.story.frequency}>
              <RefreshCw size={10} class="text-purple-500/50 inline mr-1" />
            </Show>
            {props.story.title}
          </span>
        </div>

        {/* Meta row */}
        <Show when={props.story.due_date || props.story.code || proj() || isInProgress()}>
          <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Show when={isInProgress()}>
              <span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500/70 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                <span class="relative flex h-1.5 w-1.5">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-50" />
                  <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                </span>
                En progreso
              </span>
            </Show>
            <Show when={props.story.code}>
              <span
                class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md"
                style={proj() ? {
                  "background-color": `${proj()!.color}12`,
                  color: `${proj()!.color}90`,
                } : {
                  "background-color": 'rgb(var(--bc) / 0.05)',
                  color: 'rgb(var(--bc) / 0.4)',
                }}
              >
                {props.story.code}
              </span>
            </Show>
            <Show when={props.story.due_date}>
              <span class="text-[10px] font-medium text-base-content/30">
                {(() => {
                  const d = new Date(props.story.due_date! + 'T12:00:00');
                  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
                })()}
              </span>
            </Show>
          </div>
        </Show>
      </button>

      {/* Right actions: move + priority star */}
      <div class="flex items-center shrink-0 -mr-1 gap-0.5">
        <Show when={props.moveAction}>
          {(action) => {
            const Icon = action().icon;
            return (
              <button
                onClick={(e) => { e.stopPropagation(); action().onMove(); }}
                class="w-9 h-9 flex items-center justify-center rounded-lg text-base-content/20 hover:text-base-content/50 active:bg-base-content/[0.06] active:scale-90 transition-all"
                title={`Mover a ${action().label}`}
              >
                <Icon size={14} strokeWidth={2} />
              </button>
            );
          }}
        </Show>
        <Show when={isHighPriority()}>
          <div class="w-8 h-9 flex items-center justify-center">
            <Star
              size={14}
              class={props.story.priority === 'critical' ? 'text-red-500 fill-red-500' : 'text-amber-500/50'}
              fill={props.story.priority === 'critical' ? 'currentColor' : 'none'}
            />
          </div>
        </Show>
      </div>
    </div>
  );
};

export default TasksPage;
