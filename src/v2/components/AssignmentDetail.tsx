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
      class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-300"
      onClick={() => props.onClose()}
    >
      <div
        class="bg-base-100 w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] shadow-2xl shadow-black/50 max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="sticky top-0 bg-base-100/95 backdrop-blur-sm z-10 px-5 sm:px-6 pt-5 pb-3.5 border-b border-base-content/[0.04]">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class={`flex items-center justify-center w-7 h-7 rounded-lg ${props.assignment.status === 'open' ? 'bg-orange-500/10' : 'bg-ios-green-500/10'}`}>
                <PackageCheck size={14} strokeWidth={2.5} class={props.assignment.status === 'open' ? 'text-orange-500' : 'text-ios-green-500'} />
              </div>
              <span class={`text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-lg ${props.assignment.status === 'open' ? 'bg-orange-500/10 text-orange-600' : 'bg-ios-green-500/10 text-ios-green-600'
                }`}>
                {props.assignment.status === 'open' ? 'Abierta' : 'Cerrada'}
              </span>
              <Show when={project()}>
                <span
                  class="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-lg shadow-sm"
                  style={{
                    "background-color": `${project()!.color}15`,
                    color: project()!.color,
                  }}
                >
                  {project()!.name}
                </span>
              </Show>
            </div>
            <button onClick={() => props.onClose()} class="p-2 -mr-2 rounded-full hover:bg-base-content/5 text-base-content/30 hover:text-base-content/70 transition-colors">
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div class="px-5 sm:px-6 py-5 sm:py-6 space-y-6 overflow-y-auto">

          {/* Title */}
          <h2 class="text-[20px] sm:text-[22px] font-extrabold leading-tight text-base-content/90 tracking-tight">{props.assignment.title}</h2>

          {/* People */}
          <div class="flex items-center flex-wrap gap-3">
            <Show when={assignedBy()}>
              <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-base-200/50 border border-base-content/[0.04]">
                <span class="text-[10px] uppercase font-bold text-base-content/30 tracking-wider">De</span>
                <img src={assignedBy()!.avatar_url!} alt="" class="w-5 h-5 rounded-full object-cover ring-1 ring-base-100" />
                <span class="text-[13px] font-medium text-base-content/70">{assignedBy()!.name.split(' ')[0]}</span>
              </div>
            </Show>
            <ArrowRight size={14} strokeWidth={2.5} class="text-base-content/15" />
            <Show when={assignedTo()}>
              <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-base-200/50 border border-base-content/[0.04]">
                <span class="text-[10px] uppercase font-bold text-base-content/30 tracking-wider">Para</span>
                <img src={assignedTo()!.avatar_url!} alt="" class="w-5 h-5 rounded-full object-cover ring-1 ring-base-100" />
                <span class="text-[13px] font-medium text-base-content/70">{assignedTo()!.name.split(' ')[0]}</span>
              </div>
            </Show>
          </div>

          {/* Due date */}
          <Show when={props.assignment.due_date}>
            {(() => {
              const days = getDaysUntil();
              const isOverdue = days !== null && days < 0;
              const isSoon = days !== null && days >= 0 && days <= 2;

              return (
                <div class={`inline-flex items-center gap-2 text-[13px] font-medium px-3.5 py-2 rounded-xl transition-colors ${isOverdue ? 'bg-red-500/10 text-red-600' : isSoon ? 'bg-amber-500/10 text-amber-600' : 'bg-base-content/5 text-base-content/60'
                  }`}>
                  <Calendar size={14} strokeWidth={2.5} class={isOverdue ? 'text-red-500' : isSoon ? 'text-amber-500' : 'text-base-content/40'} />
                  <span>Vence el {props.assignment.due_date}</span>
                  <Show when={isOverdue}>
                    <span class="font-bold opacity-80">(vencida)</span>
                  </Show>
                  <Show when={!isOverdue && days !== null}>
                    <span class="opacity-60">({days} días)</span>
                  </Show>
                </div>
              );
            })()}
          </Show>

          {/* Description */}
          <section class="space-y-2.5">
            <h3 class="text-[11px] font-bold uppercase tracking-[0.1em] text-base-content/30 flex items-center gap-2">
              <div class="w-1.5 h-1.5 rounded-full bg-base-content/20" />
              Detalle
            </h3>
            <div class="p-4 rounded-2xl bg-base-200/30 border border-base-content/[0.04]">
              <p class="text-[14px] sm:text-[15px] text-base-content/80 leading-relaxed whitespace-pre-wrap">{props.assignment.description}</p>
            </div>
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
