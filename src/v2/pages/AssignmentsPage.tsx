import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import type { AssignmentStatus } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { useOnceReady } from '../lib/onceReady';
import { PackageCheck, Clock, CheckCircle, Calendar } from 'lucide-solid';

const AssignmentsPage: Component = () => {
  const auth = useAuth();
  const data = useData();
  const [filter, setFilter] = createSignal<'all' | 'mine' | AssignmentStatus>('mine');

  const [assignmentsList] = createResource(() => api.assignments.list());
  const ready = useOnceReady(assignmentsList);

  const currentUser = () => auth.user();

  const filteredAssignments = () => {
    const all = assignmentsList() ?? [];
    const f = filter();
    if (f === 'all') return all;
    if (f === 'mine') return all.filter(a => a.assigned_to === currentUser()?.id);
    return all.filter(a => a.status === f);
  };

  const getDaysUntil = (dateStr: string | null) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  return (
    <Show when={ready()} fallback={<AssignmentsSkeleton />}>
    <div class="space-y-4">
      <h1 class="text-lg font-bold">Encomiendas</h1>

      {/* Filters */}
      <div class="flex gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'mine' as const, label: 'Mis encomiendas' },
          { id: 'all' as const, label: 'Todas' },
          { id: 'open' as const, label: 'Abiertas' },
          { id: 'closed' as const, label: 'Cerradas' },
        ].map((f) => (
          <button
            onClick={() => setFilter(f.id)}
            class={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              filter() === f.id
                ? 'bg-ios-blue-500 text-white'
                : 'bg-base-200 text-base-content/60 hover:bg-base-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Assignments List */}
      <div class="space-y-2">
        <For each={filteredAssignments()}>
          {(assignment) => {
            const assignedBy = data.getUserById(assignment.assigned_by);
            const assignedTo = data.getUserById(assignment.assigned_to);
            const project = assignment.project_id ? data.getProjectById(assignment.project_id) : null;
            const daysUntil = getDaysUntil(assignment.due_date);
            const isOverdue = daysUntil !== null && daysUntil < 0;
            const isUrgent = daysUntil !== null && daysUntil >= 0 && daysUntil <= 2;

            return (
              <div class={`p-4 rounded-2xl border transition-all space-y-3 ${
                assignment.status === 'closed'
                  ? 'bg-base-200/30 border-transparent opacity-60'
                  : 'bg-base-200/50 border-transparent hover:border-base-300'
              }`}>
                {/* Header */}
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <Show
                        when={assignment.status === 'open'}
                        fallback={<CheckCircle size={14} class="text-ios-green-500 shrink-0" />}
                      >
                        <PackageCheck size={14} class="text-ios-blue-500 shrink-0" />
                      </Show>
                      <Show when={project}>
                        <span
                          class="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{
                            "background-color": `${project!.color}15`,
                            color: project!.color,
                          }}
                        >
                          {project!.name}
                        </span>
                      </Show>
                    </div>
                    <p class={`text-sm font-medium ${assignment.status === 'closed' ? 'line-through' : ''}`}>
                      {assignment.title}
                    </p>
                    <p class="text-xs text-base-content/50 mt-1">{assignment.description}</p>
                  </div>
                </div>

                {/* Footer */}
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3 text-[10px] text-base-content/40">
                    <div class="flex items-center gap-1">
                      <span>De:</span>
                      <Show when={assignedBy}>
                        <img src={assignedBy!.avatar_url!} alt="" class="w-4 h-4 rounded-full" />
                        <span>{assignedBy!.name.split(' ')[0]}</span>
                      </Show>
                    </div>
                    <div class="flex items-center gap-1">
                      <span>Para:</span>
                      <Show when={assignedTo}>
                        <img src={assignedTo!.avatar_url!} alt="" class="w-4 h-4 rounded-full" />
                        <span>{assignedTo!.name.split(' ')[0]}</span>
                      </Show>
                    </div>
                  </div>
                  <Show when={assignment.due_date && assignment.status === 'open'}>
                    <div class={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg ${
                      isOverdue
                        ? 'bg-red-500/10 text-red-500'
                        : isUrgent
                          ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-base-200 text-base-content/40'
                    }`}>
                      <Calendar size={10} />
                      <span>{assignment.due_date}</span>
                      <Show when={isOverdue}>
                        <span>(vencida)</span>
                      </Show>
                    </div>
                  </Show>
                  <Show when={assignment.status === 'closed'}>
                    <span class="text-[10px] text-ios-green-500">Cerrada</span>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>

        <Show when={filteredAssignments().length === 0}>
          <div class="text-center py-8 text-sm text-base-content/30">
            No hay encomiendas con este filtro
          </div>
        </Show>
      </div>
    </div>
    </Show>
  );
};

const AssignmentsSkeleton: Component = () => (
  <div class="space-y-4 animate-pulse">
    <div class="h-7 w-32 rounded bg-base-200/60" />
    <div class="flex gap-1.5">
      <div class="h-8 w-28 rounded-lg bg-base-200/60" />
      <div class="h-8 w-20 rounded-lg bg-base-200/60" />
    </div>
    <div class="h-24 rounded-2xl bg-base-200/50" />
    <div class="h-24 rounded-2xl bg-base-200/50" />
  </div>
);

export default AssignmentsPage;
