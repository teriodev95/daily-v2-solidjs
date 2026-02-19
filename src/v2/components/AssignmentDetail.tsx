import { Show, type Component } from 'solid-js';
import type { Assignment } from '../types';
import { useData } from '../lib/data';
import { X, PackageCheck, Calendar, User, ArrowRight } from 'lucide-solid';

interface Props {
  assignment: Assignment;
  onClose: () => void;
}

const AssignmentDetail: Component<Props> = (props) => {
  const data = useData();

  const project = () => props.assignment.project_id ? data.getProjectById(props.assignment.project_id) : null;
  const assignedBy = () => data.getUserById(props.assignment.assigned_by);
  const assignedTo = () => data.getUserById(props.assignment.assigned_to);

  const getDaysUntil = () => {
    if (!props.assignment.due_date) return null;
    return Math.ceil((new Date(props.assignment.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div
      class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={() => props.onClose()}
    >
      <div
        class="bg-base-100 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="sticky top-0 bg-base-100 z-10 px-5 pt-4 pb-3 border-b border-base-300/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <PackageCheck size={16} class={props.assignment.status === 'open' ? 'text-orange-500' : 'text-ios-green-500'} />
              <span class={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                props.assignment.status === 'open' ? 'bg-orange-500/10 text-orange-500' : 'bg-ios-green-500/10 text-ios-green-500'
              }`}>
                {props.assignment.status === 'open' ? 'Abierta' : 'Cerrada'}
              </span>
              <Show when={project()}>
                <span
                  class="text-[10px] font-medium px-2 py-0.5 rounded-md"
                  style={{
                    "background-color": `${project()!.color}15`,
                    color: project()!.color,
                  }}
                >
                  {project()!.name}
                </span>
              </Show>
            </div>
            <button onClick={() => props.onClose()} class="p-1.5 rounded-lg hover:bg-base-content/10 transition-colors">
              <X size={18} class="text-base-content/40" />
            </button>
          </div>
        </div>

        <div class="px-5 py-5 space-y-5">

          {/* Title */}
          <h2 class="text-lg font-bold leading-snug">{props.assignment.title}</h2>

          {/* People */}
          <div class="flex items-center gap-4">
            <Show when={assignedBy()}>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-base-content/25">De</span>
                <img src={assignedBy()!.avatar_url!} alt="" class="w-6 h-6 rounded-full" />
                <span class="text-xs text-base-content/60">{assignedBy()!.name}</span>
              </div>
            </Show>
            <ArrowRight size={12} class="text-base-content/15" />
            <Show when={assignedTo()}>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-base-content/25">Para</span>
                <img src={assignedTo()!.avatar_url!} alt="" class="w-6 h-6 rounded-full" />
                <span class="text-xs text-base-content/60">{assignedTo()!.name}</span>
              </div>
            </Show>
          </div>

          {/* Due date */}
          <Show when={props.assignment.due_date}>
            {(() => {
              const days = getDaysUntil();
              return (
                <div class={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg ${
                  days !== null && days < 0
                    ? 'bg-red-500/10 text-red-500'
                    : days !== null && days <= 2
                      ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-base-content/5 text-base-content/50'
                }`}>
                  <Calendar size={12} />
                  <span>Fecha límite: {props.assignment.due_date}</span>
                  <Show when={days !== null && days < 0}>
                    <span class="font-medium">(vencida)</span>
                  </Show>
                  <Show when={days !== null && days >= 0}>
                    <span class="text-base-content/30">({days} días)</span>
                  </Show>
                </div>
              );
            })()}
          </Show>

          {/* Description */}
          <section class="space-y-1.5">
            <h3 class="text-[10px] font-bold uppercase tracking-wider text-base-content/25">Detalle</h3>
            <p class="text-sm text-base-content/70 leading-relaxed whitespace-pre-wrap">{props.assignment.description}</p>
          </section>

          {/* Closed date */}
          <Show when={props.assignment.closed_at}>
            <div class="text-xs text-ios-green-500/70 flex items-center gap-1.5">
              <span>Cerrada el {props.assignment.closed_at}</span>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default AssignmentDetail;
