import { createSignal, Show, type Component } from 'solid-js';
import type { Assignment } from '../../types';
import { useData } from '../../lib/data';
import { api } from '../../lib/api';
import { ArrowRight, CalendarClock, CheckCircle2, Loader2, PackageCheck, X } from 'lucide-solid';

interface MobileAssignmentDetailProps {
  assignment: Assignment;
  onClose: () => void;
  onUpdated?: (assignment: Assignment) => void;
}

const MobileAssignmentDetail: Component<MobileAssignmentDetailProps> = (props) => {
  const data = useData();
  const [closing, setClosing] = createSignal(false);
  const [error, setError] = createSignal('');

  const project = () => props.assignment.project_id ? data.getProjectById(props.assignment.project_id) : null;
  const assignedBy = () => data.getUserById(props.assignment.assigned_by);
  const assignedTo = () => data.getUserById(props.assignment.assigned_to);

  const dueMeta = () => {
    if (!props.assignment.due_date) {
      return {
        badge: 'Sin fecha',
        detail: 'No tiene vencimiento definido',
        badgeClass: 'bg-base-content/[0.05] text-base-content/45',
        detailClass: 'text-base-content/34',
      };
    }

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const due = new Date(`${props.assignment.due_date}T12:00:00`);
    const diff = Math.round((due.getTime() - start.getTime()) / 86400000);
    const exact = due.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });

    if (diff < 0) {
      return {
        badge: `Vencida ${Math.abs(diff)}d`,
        detail: `Debió entregarse ${exact}`,
        badgeClass: 'bg-red-500/14 text-red-400',
        detailClass: 'text-red-300/80',
      };
    }

    if (diff === 0) {
      return {
        badge: 'Hoy',
        detail: `Vence ${exact}`,
        badgeClass: 'bg-amber-500/14 text-amber-300',
        detailClass: 'text-amber-200/80',
      };
    }

    if (diff === 1) {
      return {
        badge: 'Mañana',
        detail: `Vence ${exact}`,
        badgeClass: 'bg-ios-blue-500/14 text-ios-blue-300',
        detailClass: 'text-ios-blue-200/80',
      };
    }

    return {
      badge: `${diff} días`,
      detail: `Vence ${exact}`,
      badgeClass: 'bg-purple-500/14 text-purple-300',
      detailClass: 'text-base-content/40',
    };
  };

  const handleCloseAssignment = async () => {
    if (closing()) return;
    setClosing(true);
    setError('');

    try {
      const updated = await api.assignments.update(props.assignment.id, {
        status: 'closed',
        closed_at: new Date().toISOString(),
      });
      props.onUpdated?.(updated);
      props.onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo completar la encomienda');
    } finally {
      setClosing(false);
    }
  };

  return (
    <div
      class="fixed inset-0 bg-black/72 backdrop-blur-xl sm:hidden"
      style={{ 'z-index': 220 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div class="absolute inset-x-0 bottom-0 top-[max(1rem,env(safe-area-inset-top))] overflow-hidden rounded-t-[32px] border border-base-content/[0.08] bg-[linear-gradient(180deg,rgba(18,18,20,0.98),rgba(8,8,10,0.99))] shadow-[0_-32px_90px_rgba(0,0,0,0.48)]">
        <div class="flex h-full flex-col">
          <div class="sticky top-0 z-20 border-b border-base-content/[0.06] bg-base-100/85 px-4 pt-4 pb-3 backdrop-blur-xl">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                    props.assignment.status === 'open'
                      ? 'bg-orange-500/12 text-orange-300'
                      : 'bg-ios-green-500/12 text-ios-green-300'
                  }`}>
                    <PackageCheck size={12} />
                    {props.assignment.status === 'open' ? 'Abierta' : 'Cerrada'}
                  </span>
                  <Show when={project()}>
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                      style={{ 'background-color': `${project()!.color}18`, color: project()!.color }}
                    >
                      <span class="h-2 w-2 rounded-full" style={{ 'background-color': project()!.color }} />
                      {project()!.prefix}
                    </span>
                  </Show>
                </div>
                <p class="mt-3 text-[22px] leading-tight font-semibold tracking-tight text-base-content/92 whitespace-normal break-words">
                  {props.assignment.title}
                </p>
              </div>
              <button onClick={props.onClose} class="rounded-full p-2 text-base-content/35 transition-colors hover:bg-base-content/[0.05] hover:text-base-content/70">
                <X size={20} />
              </button>
            </div>
          </div>

          <div class="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
            <div class="flex items-center gap-2 flex-wrap">
              <Show when={assignedBy()}>
                <div class="inline-flex items-center gap-2 rounded-2xl border border-base-content/[0.05] bg-base-content/[0.03] px-3 py-2">
                  <span class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/30">De</span>
                  <span class="text-[13px] font-medium text-base-content/78">{assignedBy()!.name}</span>
                </div>
              </Show>
              <ArrowRight size={14} class="text-base-content/18" />
              <Show when={assignedTo()}>
                <div class="inline-flex items-center gap-2 rounded-2xl border border-base-content/[0.05] bg-base-content/[0.03] px-3 py-2">
                  <span class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/30">Para</span>
                  <span class="text-[13px] font-medium text-base-content/78">{assignedTo()!.name}</span>
                </div>
              </Show>
            </div>

            <div class="rounded-[24px] border border-base-content/[0.06] bg-base-content/[0.025] p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/28">Vencimiento</p>
                  <p class={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold ${dueMeta().badgeClass}`}>
                    <CalendarClock size={13} />
                    {dueMeta().badge}
                  </p>
                </div>
              </div>
              <p class={`mt-3 text-[13px] leading-relaxed ${dueMeta().detailClass}`}>{dueMeta().detail}</p>
            </div>

            <div class="rounded-[24px] border border-base-content/[0.06] bg-base-content/[0.025] p-4">
              <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-base-content/28">Detalle</p>
              <p class="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-base-content/78">
                {props.assignment.description?.trim() ? props.assignment.description : 'Sin descripción adicional.'}
              </p>
            </div>

            <Show when={error()}>
              <div class="rounded-2xl border border-red-500/18 bg-red-500/8 px-4 py-3 text-[12px] font-medium text-red-300">
                {error()}
              </div>
            </Show>
          </div>

          <div class="sticky bottom-0 border-t border-base-content/[0.06] bg-base-100/88 px-4 py-3 backdrop-blur-xl">
            <button
              onClick={handleCloseAssignment}
              disabled={closing() || props.assignment.status === 'closed'}
              class="flex w-full items-center justify-center gap-2 rounded-[22px] bg-ios-green-500 px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_16px_40px_rgba(52,199,89,0.28)] transition-all disabled:cursor-not-allowed disabled:bg-base-content/[0.1] disabled:text-base-content/35 disabled:shadow-none"
            >
              <Show when={closing()} fallback={<CheckCircle2 size={18} />}>
                <Loader2 size={18} class="animate-spin" />
              </Show>
              {props.assignment.status === 'closed' ? 'Encomienda cerrada' : 'Marcar como completada'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileAssignmentDetail;
