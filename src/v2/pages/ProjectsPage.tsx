import { createSignal, createResource, createEffect, For, Show, type Component } from 'solid-js';
import type { Story, Project, StoryStatus } from '../types';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { useAuth } from '../lib/auth';
import {
  Plus, ArrowUp, ArrowRight, ArrowDown, Flame, RefreshCw, User, Layers,
} from 'lucide-solid';
import StoryDetail from '../components/StoryDetail';

interface ProjectsPageProps {
  onCreateStory?: (projectId: string) => void;
  refreshKey?: number;
  onStoryDeleted?: () => void;
}

const ALL_PROJECTS = '__all__';

const priorityConfig: Record<string, { color: string; icon: any }> = {
  critical: { color: 'text-red-500', icon: Flame },
  high: { color: 'text-orange-500', icon: ArrowUp },
  medium: { color: 'text-ios-blue-500', icon: ArrowRight },
  low: { color: 'text-base-content/30', icon: ArrowDown },
};

const estimateMap: Record<number, string> = { 1: '🐝', 2: '🐭', 3: '🐦', 4: '🐱', 5: '🐶', 6: '🐄', 7: '🐘', 8: '🐋' };
const estimateEmoji = (v: number) => estimateMap[v] ?? '';

const columns: { id: StoryStatus; label: string; dot: string; emptyLabel: string }[] = [
  { id: 'backlog', label: 'Backlog', dot: 'bg-base-content/25', emptyLabel: 'Sin historias en backlog' },
  { id: 'todo', label: 'Por hacer', dot: 'bg-ios-blue-500', emptyLabel: 'Nada pendiente' },
  { id: 'in_progress', label: 'En progreso', dot: 'bg-amber-500', emptyLabel: 'Nada en progreso' },
  { id: 'done', label: 'Hecho', dot: 'bg-ios-green-500', emptyLabel: 'Sin historias completadas' },
];

const ProjectsPage: Component<ProjectsPageProps> = (props) => {
  const data = useData();
  const auth = useAuth();

  // Default: "Mías" ON + "Todos" selected
  const [selectedProjectId, setSelectedProjectId] = createSignal<string>(ALL_PROJECTS);
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);
  const [dragOverCol, setDragOverCol] = createSignal<StoryStatus | null>(null);
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [onlyMine, setOnlyMine] = createSignal(true);

  // Local stories state for optimistic updates
  const [localStories, setLocalStories] = createSignal<Story[]>([]);

  const activeProjects = () => data.projects().filter(p => p.status === 'active');

  const isAllProjects = () => selectedProjectId() === ALL_PROJECTS;

  const selectedProject = () =>
    activeProjects().find(p => p.id === selectedProjectId()) ?? null;

  // Fetch stories — all or by project
  const [projectStories, { refetch }] = createResource(
    () => ({ pid: selectedProjectId(), _r: props.refreshKey }),
    ({ pid }) => {
      if (pid === ALL_PROJECTS) return api.stories.list();
      return pid ? api.stories.list({ project_id: pid }) : Promise.resolve([]);
    },
  );

  // Sync fetched stories to local state
  createEffect(() => {
    const fetched = projectStories();
    if (fetched) setLocalStories(fetched as Story[]);
  });

  const filteredStories = () => {
    const all = localStories();
    if (!onlyMine()) return all;
    const uid = auth.user()?.id;
    if (!uid) return all;
    return all.filter(s =>
      s.assignee_id === uid || (s.assignees && s.assignees.includes(uid)) || s.created_by === uid
    );
  };

  const storiesByStatus = (status: StoryStatus) =>
    filteredStories().filter(s => s.status === status);

  const columnCount = (status: StoryStatus) =>
    filteredStories().filter(s => s.status === status).length;

  // --- Drag and Drop ---
  const handleDragStart = (e: DragEvent, storyId: string) => {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', storyId);
    setDraggingId(storyId);
  };

  const handleDragOver = (e: DragEvent, status: StoryStatus) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    setDragOverCol(status);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = async (e: DragEvent, newStatus: StoryStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    setDraggingId(null);

    const storyId = e.dataTransfer!.getData('text/plain');
    if (!storyId) return;

    const story = localStories().find(s => s.id === storyId);
    if (!story || story.status === newStatus) return;

    // Optimistic update
    const oldStatus = story.status;
    setLocalStories(prev =>
      prev.map(s => s.id === storyId ? { ...s, status: newStatus } : s)
    );

    try {
      await api.stories.update(storyId, { status: newStatus });
    } catch {
      // Revert on error
      setLocalStories(prev =>
        prev.map(s => s.id === storyId ? { ...s, status: oldStatus } : s)
      );
    }
  };

  const handleDragEnd = () => {
    setDragOverCol(null);
    setDraggingId(null);
  };

  const getProjectForStory = (projectId: string | null) => {
    if (!projectId) return null;
    return data.getProjectById(projectId) ?? null;
  };

  return (
    <div class="space-y-4">
      {/* Filter bar */}
      <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {/* Filter: Mías */}
        <button
          onClick={() => setOnlyMine(v => !v)}
          class={`flex items-center gap-1.5 h-9 px-3 rounded-[14px] text-xs font-semibold whitespace-nowrap transition-all duration-300 shrink-0 ${onlyMine()
              ? 'bg-ios-blue-500 text-white shadow-md shadow-ios-blue-500/20'
              : 'bg-base-200/50 text-base-content/40 hover:bg-base-200 hover:text-base-content/70 border border-base-content/[0.04]'
            }`}
        >
          <Show when={auth.user()?.avatar_url} fallback={<User size={14} strokeWidth={2.5} />}>
            <img src={auth.user()!.avatar_url!} alt="" class={`w-4 h-4 rounded-full object-cover ${onlyMine() ? 'ring-1 ring-white/30' : 'opacity-50'}`} />
          </Show>
          Mías
        </button>

        {/* Tab: Todos */}
        <button
          onClick={() => setSelectedProjectId(ALL_PROJECTS)}
          class={`flex items-center gap-1.5 h-9 px-3 rounded-[14px] text-xs font-semibold whitespace-nowrap transition-all duration-300 shrink-0 ${isAllProjects()
              ? 'bg-base-content text-base-100 shadow-md shadow-base-content/10'
              : 'bg-base-200/50 text-base-content/60 hover:bg-base-200 hover:text-base-content/90 border border-base-content/[0.04]'
            }`}
        >
          <Layers size={13} strokeWidth={2.5} />
          Todos
        </button>

        <div class="w-px h-5 bg-base-content/[0.06] shrink-0" />

        {/* Project tabs */}
        <For each={activeProjects()}>
          {(project) => {
            const active = () => selectedProjectId() === project.id;
            return (
              <button
                onClick={() => setSelectedProjectId(project.id)}
                class={`group flex items-center gap-2 h-9 px-3.5 rounded-[14px] text-xs font-semibold whitespace-nowrap transition-all duration-300 shrink-0 ${active()
                    ? 'bg-base-content text-base-100 shadow-md shadow-base-content/10'
                    : 'bg-base-200/50 text-base-content/60 hover:bg-base-200 hover:text-base-content/90 border border-base-content/[0.04]'
                  }`}
              >
                <div
                  class={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold shadow-sm ${
                    active() ? 'text-white' : 'text-white/95'
                  }`}
                  style={{ "background-color": project.color }}
                >
                  {project.prefix.slice(0, 2)}
                </div>
                <span>{project.name}</span>
                <div class={`w-1.5 h-1.5 rounded-full shrink-0 transition-opacity ${active() ? 'opacity-100 ring-2 ring-base-100/30' : 'opacity-60 group-hover:opacity-100'}`} style={{ "background-color": project.color }} />
              </button>
            );
          }}
        </For>

        <Show when={selectedProject()}>
          <button
            onClick={() => props.onCreateStory?.(selectedProjectId()!)}
            class="flex items-center gap-1.5 h-9 px-3.5 ml-1 rounded-[14px] text-xs font-semibold text-ios-blue-500 bg-ios-blue-500/10 hover:bg-ios-blue-500/15 transition-all shrink-0 shadow-sm shadow-ios-blue-500/5 hover:scale-[1.02]"
          >
            <Plus size={14} strokeWidth={2.5} />
            Nueva HU
          </button>
        </Show>
      </div>

      {/* Kanban board */}
      <Show when={!projectStories.loading} fallback={<KanbanSkeleton />}>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start h-full">
          <For each={columns}>
            {(col) => (
              <div
                class={`flex flex-col rounded-2xl transition-all min-h-[120px] sm:min-h-[400px] border ${dragOverCol() === col.id
                    ? 'bg-ios-blue-500/[0.08] ring-2 ring-ios-blue-500/30 ring-dashed border-ios-blue-500/20'
                    : 'bg-base-200/30 border-base-content/[0.05]'
                  }`}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-base-content/[0.04]">
                  <div class="flex items-center gap-2">
                    <div class={`w-2 h-2 rounded-full ${col.dot} shadow-sm`} />
                    <span class="text-[11px] font-bold text-base-content/70 tracking-wide uppercase">{col.label}</span>
                  </div>
                  <span class="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-base-content/[0.06] text-[10px] text-base-content/50 font-bold">{columnCount(col.id)}</span>
                </div>

                {/* Cards */}
                <div class="flex-1 p-2 space-y-2 overflow-y-auto scrollbar-none hover:scrollbar-thin hover:scrollbar-thumb-base-content/10">
                  <For each={storiesByStatus(col.id)}>
                    {(story) => {
                      const prio = priorityConfig[story.priority];
                      const PrioIcon = prio.icon;
                      const assignee = story.assignee_id ? data.getUserById(story.assignee_id) : null;
                      const proj = isAllProjects() ? getProjectForStory(story.project_id) : null;

                      return (
                        <div
                          draggable="true"
                          onDragStart={(e) => handleDragStart(e, story.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedStory(story)}
                          class={`group relative p-3.5 rounded-[14px] bg-base-100/90 hover:bg-base-100 border border-base-content/[0.06] hover:border-base-content/[0.15] cursor-pointer transition-all duration-200 shadow-sm ${draggingId() === story.id
                              ? 'opacity-40 scale-95 shadow-none'
                              : 'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-base-content/5 z-10'
                            }`}
                        >
                          {/* Identifier & Avatar */}
                          <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-1.5">
                              <Show when={story.code}>
                                <span class="text-[10px] font-mono font-semibold text-base-content/40 tracking-wider">
                                  {story.code}
                                </span>
                              </Show>
                              <div class={`flex items-center justify-center w-5 h-5 rounded-md bg-base-content/[0.03] ${prio.color}`}>
                                <PrioIcon size={12} strokeWidth={2.5} />
                              </div>
                            </div>
                            <Show when={assignee}>
                              <div class="relative group/avatar">
                                <div class="w-5 h-5 rounded-full bg-base-content/5 overflow-hidden ring-2 ring-base-100/50 shadow-sm">
                                  <Show when={assignee?.avatar_url} fallback={
                                    <div class="w-full h-full flex items-center justify-center text-[8px] font-bold text-base-content/50 uppercase">
                                      {assignee!.name.substring(0, 2)}
                                    </div>
                                  }>
                                    <img
                                      src={assignee!.avatar_url!}
                                      alt=""
                                      class="w-full h-full object-cover"
                                    />
                                  </Show>
                                </div>
                              </div>
                            </Show>
                          </div>

                          {/* Title */}
                          <p class="text-[13px] font-medium leading-relaxed text-base-content/90 mb-3 group-hover:text-base-content transition-colors line-clamp-3">
                            <Show when={story.frequency}><RefreshCw size={9} class="text-purple-500/50 inline mr-1" /></Show>
                            {story.title}
                          </p>

                          {/* Meta info bottom */}
                          <div class="flex items-center gap-1.5 mt-auto pt-1 flex-wrap">
                            {/* Project badge — only in "Todos" mode */}
                            <Show when={proj}>
                              <span
                                class="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                                style={{ "background-color": `${proj!.color}15`, color: proj!.color }}
                              >
                                {proj!.prefix}
                              </span>
                            </Show>
                            <Show when={story.estimate > 0}>
                              <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-base-content/[0.03] text-[10px] font-medium text-base-content/60 border border-base-content/[0.03]">
                                <span>{story.estimate}</span>
                                <span>{estimateEmoji(story.estimate)}</span>
                              </div>
                            </Show>
                            <Show when={story.due_date}>
                              <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-base-content/[0.03] text-[10px] font-medium text-base-content/60 border border-base-content/[0.03]">
                                <span>{story.due_date}</span>
                              </div>
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>

                  {/* Empty state */}
                  <Show when={storiesByStatus(col.id).length === 0}>
                    <div class="flex flex-col items-center justify-center h-full py-8 text-center opacity-0 animate-in fade-in duration-500">
                      <div class="w-8 h-8 rounded-full bg-base-content/[0.02] flex items-center justify-center mb-2">
                        <div class={`w-1.5 h-1.5 rounded-full ${col.dot} opacity-40`} />
                      </div>
                      <span class="text-[11px] font-medium text-base-content/40">
                        {col.emptyLabel}
                      </span>
                    </div>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Story Detail Modal */}
      <Show when={selectedStory()}>
        {(story) => (
          <StoryDetail
            story={story()}
            onClose={() => setSelectedStory(null)}
            onDeleted={() => { setSelectedStory(null); refetch(); props.onStoryDeleted?.(); }}
            onUpdated={(id, fields) => {
              setLocalStories(prev => {
                if (fields.is_active === false) {
                  return prev.filter(s => s.id !== id);
                }
                return prev.map(s => s.id === id ? { ...s, ...fields } as Story : s);
              });
            }}
          />
        )}
      </Show>
    </div>
  );
};

const KanbanSkeleton: Component = () => (
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
    {[...Array(4)].map(() => (
      <div class="flex flex-col space-y-2 rounded-2xl bg-base-200/30 border border-base-content/[0.05] p-2 pt-3 min-h-[400px]">
        <div class="h-4 w-20 rounded-md bg-base-content/5 mx-2 mb-2" />
        <div class="h-28 rounded-[14px] bg-base-100/50 border border-base-content/[0.02]" />
        <div class="h-28 rounded-[14px] bg-base-100/50 border border-base-content/[0.02]" />
      </div>
    ))}
  </div>
);

export default ProjectsPage;
