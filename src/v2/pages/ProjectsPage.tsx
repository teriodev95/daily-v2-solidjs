import { createSignal, createResource, createEffect, For, Show, type Component } from 'solid-js';
import type { Story, Project, StoryStatus } from '../types';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import {
  Plus, ArrowUp, ArrowRight, ArrowDown, Flame,
} from 'lucide-solid';
import StoryDetail from '../components/StoryDetail';

interface ProjectsPageProps {
  onCreateStory?: (projectId: string) => void;
  refreshKey?: number;
  onStoryDeleted?: () => void;
}

const priorityConfig: Record<string, { color: string; icon: any }> = {
  critical: { color: 'text-red-500', icon: Flame },
  high: { color: 'text-orange-500', icon: ArrowUp },
  medium: { color: 'text-ios-blue-500', icon: ArrowRight },
  low: { color: 'text-base-content/30', icon: ArrowDown },
};

const columns: { id: StoryStatus; label: string; dot: string; emptyLabel: string }[] = [
  { id: 'backlog', label: 'Backlog', dot: 'bg-base-content/25', emptyLabel: 'Sin historias en backlog' },
  { id: 'todo', label: 'Por hacer', dot: 'bg-ios-blue-500', emptyLabel: 'Nada pendiente' },
  { id: 'in_progress', label: 'En progreso', dot: 'bg-amber-500', emptyLabel: 'Nada en progreso' },
  { id: 'done', label: 'Hecho', dot: 'bg-ios-green-500', emptyLabel: 'Sin historias completadas' },
];

const ProjectsPage: Component<ProjectsPageProps> = (props) => {
  const data = useData();
  const [selectedProjectId, setSelectedProjectId] = createSignal<string | null>(null);
  const [selectedStory, setSelectedStory] = createSignal<Story | null>(null);
  const [dragOverCol, setDragOverCol] = createSignal<StoryStatus | null>(null);
  const [draggingId, setDraggingId] = createSignal<string | null>(null);

  // Local stories state for optimistic updates
  const [localStories, setLocalStories] = createSignal<Story[]>([]);

  const activeProjects = () => data.projects().filter(p => p.status === 'active');

  // Auto-select first project
  createEffect(() => {
    const projects = activeProjects();
    if (projects.length > 0 && !selectedProjectId()) {
      setSelectedProjectId(projects[0].id);
    }
  });

  const selectedProject = () =>
    activeProjects().find(p => p.id === selectedProjectId()) ?? null;

  // Fetch stories for selected project
  const [projectStories, { refetch }] = createResource(
    () => ({ pid: selectedProjectId(), _r: props.refreshKey }),
    ({ pid }) => pid ? api.stories.list({ project_id: pid }) : Promise.resolve([]),
  );

  // Sync fetched stories to local state
  createEffect(() => {
    const fetched = projectStories();
    if (fetched) setLocalStories(fetched as Story[]);
  });

  const storiesByStatus = (status: StoryStatus) =>
    localStories().filter(s => s.status === status);

  const columnCount = (status: StoryStatus) =>
    localStories().filter(s => s.status === status).length;

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

  return (
    <div class="space-y-4">
      {/* Project tabs */}
      <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <For each={activeProjects()}>
          {(project) => {
            const active = () => selectedProjectId() === project.id;
            return (
              <button
                onClick={() => setSelectedProjectId(project.id)}
                class={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                  active()
                    ? 'bg-base-content/10 text-base-content ring-1 ring-base-content/[0.06]'
                    : 'text-base-content/40 hover:bg-base-content/5'
                }`}
              >
                <Show when={project.icon_url}>
                  <img src={project.icon_url!} alt="" class="w-5 h-5 rounded-md" />
                </Show>
                <span>{project.name}</span>
                <div class="w-1.5 h-1.5 rounded-full shrink-0" style={{ "background-color": project.color }} />
              </button>
            );
          }}
        </For>
        <Show when={selectedProject()}>
          <button
            onClick={() => props.onCreateStory?.(selectedProjectId()!)}
            class="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-ios-blue-500 hover:bg-ios-blue-500/10 transition-all shrink-0"
          >
            <Plus size={14} />
            Nueva HU
          </button>
        </Show>
      </div>

      {/* Kanban board */}
      <Show
        when={selectedProject()}
        fallback={
          <div class="flex items-center justify-center py-20 text-sm text-base-content/30">
            Selecciona un proyecto
          </div>
        }
      >
        <Show when={!projectStories.loading} fallback={<KanbanSkeleton />}>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 items-start">
            <For each={columns}>
              {(col) => (
                <div
                  class={`rounded-2xl transition-all min-h-[200px] ${
                    dragOverCol() === col.id
                      ? 'bg-ios-blue-500/[0.06] ring-2 ring-ios-blue-500/20 ring-dashed'
                      : 'bg-base-content/[0.02]'
                  }`}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.id)}
                >
                  {/* Column header */}
                  <div class="flex items-center gap-2 px-3 pt-3 pb-2">
                    <div class={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span class="text-[11px] font-semibold text-base-content/50">{col.label}</span>
                    <span class="text-[10px] text-base-content/20 ml-auto">{columnCount(col.id)}</span>
                  </div>

                  {/* Cards */}
                  <div class="px-2 pb-2 space-y-1.5">
                    <For each={storiesByStatus(col.id)}>
                      {(story) => {
                        const prio = priorityConfig[story.priority];
                        const PrioIcon = prio.icon;
                        const assignee = story.assignee_id ? data.getUserById(story.assignee_id) : null;

                        return (
                          <div
                            draggable="true"
                            onDragStart={(e) => handleDragStart(e, story.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => setSelectedStory(story)}
                            class={`p-2.5 rounded-xl bg-base-100 border border-base-content/[0.04] hover:border-base-content/[0.08] cursor-pointer transition-all group ${
                              draggingId() === story.id ? 'opacity-40 scale-95' : 'hover:shadow-sm'
                            }`}
                          >
                            {/* Code + priority */}
                            <div class="flex items-center gap-1.5 mb-1">
                              <Show when={story.code}>
                                <span class="text-[9px] font-mono font-bold text-base-content/25">{story.code}</span>
                              </Show>
                              <PrioIcon size={10} class={prio.color} />
                              <Show when={assignee}>
                                <img
                                  src={assignee!.avatar_url!}
                                  alt=""
                                  class="w-4 h-4 rounded-full ml-auto"
                                />
                              </Show>
                            </div>
                            {/* Title */}
                            <p class="text-[12px] font-medium leading-snug text-base-content/80 line-clamp-2">
                              {story.title}
                            </p>
                            {/* Meta */}
                            <Show when={story.estimate > 0 || story.due_date}>
                              <div class="flex items-center gap-2 mt-1.5">
                                <Show when={story.estimate > 0}>
                                  <span class="text-[9px] text-base-content/20">{story.estimate}pts</span>
                                </Show>
                                <Show when={story.due_date}>
                                  <span class="text-[9px] text-base-content/20">{story.due_date}</span>
                                </Show>
                              </div>
                            </Show>
                          </div>
                        );
                      }}
                    </For>

                    {/* Empty state */}
                    <Show when={storiesByStatus(col.id).length === 0}>
                      <div class="px-2 py-6 text-center text-[10px] text-base-content/15">
                        {col.emptyLabel}
                      </div>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Story Detail Modal */}
      <Show when={selectedStory()}>
        {(story) => (
          <StoryDetail story={story()} onClose={() => setSelectedStory(null)} onDeleted={() => { setSelectedStory(null); refetch(); props.onStoryDeleted?.(); }} />
        )}
      </Show>
    </div>
  );
};

const KanbanSkeleton: Component = () => (
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    {[...Array(4)].map(() => (
      <div class="space-y-1.5 rounded-2xl bg-base-content/[0.02] p-2 pt-3">
        <div class="h-3 w-16 rounded bg-base-200/60 mx-1 mb-2" />
        <div class="h-16 rounded-xl bg-base-200/40" />
        <div class="h-16 rounded-xl bg-base-200/40" />
      </div>
    ))}
  </div>
);

export default ProjectsPage;
