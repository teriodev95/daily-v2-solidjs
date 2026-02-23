import { createSignal, For, Show, type Component } from 'solid-js';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { X, Loader2, CalendarDays, XCircle } from 'lucide-solid';
import type { Assignment } from '../types';

interface CreateAssignmentModalProps {
  assignment?: Assignment;
  onClose: () => void;
  onSaved: () => void;
}

const CreateAssignmentModal: Component<CreateAssignmentModalProps> = (props) => {
  const auth = useAuth();
  const data = useData();
  const isEdit = () => !!props.assignment;

  const [title, setTitle] = createSignal(props.assignment?.title ?? '');
  const [description, setDescription] = createSignal(props.assignment?.description ?? '');
  const [assignedTo, setAssignedTo] = createSignal(props.assignment?.assigned_to ?? '');
  const [projectId, setProjectId] = createSignal(props.assignment?.project_id ?? '');
  const [dueDate, setDueDate] = createSignal(props.assignment?.due_date?.split('T')[0] ?? '');
  const [submitting, setSubmitting] = createSignal(false);
  const [closing, setClosing] = createSignal(false);
  const [error, setError] = createSignal('');

  const activeMembers = () => data.users().filter(u => u.is_active);
  const activeProjects = () => data.projects().filter(p => p.status === 'active');

  const canSubmit = () => title().trim() && assignedTo();

  const handleSubmit = async () => {
    if (!canSubmit() || submitting()) return;
    setSubmitting(true);
    setError('');

    try {
      if (isEdit()) {
        await api.assignments.update(props.assignment!.id, {
          title: title().trim(),
          description: description().trim(),
          assigned_to: assignedTo(),
          project_id: projectId() || null,
          due_date: dueDate() || null,
        });
      } else {
        await api.assignments.create({
          assigned_to: assignedTo(),
          title: title().trim(),
          description: description().trim() || undefined,
          project_id: projectId() || undefined,
          due_date: dueDate() || undefined,
        });
      }
      props.onSaved();
      props.onClose();
    } catch (e: any) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (!props.assignment || closing()) return;
    setClosing(true);
    try {
      await api.assignments.update(props.assignment.id, { status: 'closed', closed_at: new Date().toISOString() });
      props.onSaved();
      props.onClose();
    } catch (e: any) {
      setError(e.message || 'Error al cerrar');
    } finally {
      setClosing(false);
    }
  };

  const handleReopen = async () => {
    if (!props.assignment || closing()) return;
    setClosing(true);
    try {
      await api.assignments.update(props.assignment.id, { status: 'open', closed_at: null });
      props.onSaved();
      props.onClose();
    } catch (e: any) {
      setError(e.message || 'Error al reabrir');
    } finally {
      setClosing(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isClosed = () => props.assignment?.status === 'closed';

  return (
    <div
      class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div class="bg-base-100 w-full sm:max-w-md sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <div class="w-2 h-2 rounded-full bg-purple-500" />
            </div>
            <h2 class="text-base font-semibold">{isEdit() ? 'Editar encomienda' : 'Nueva encomienda'}</h2>
            <Show when={isClosed()}>
              <span class="text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-base-content/[0.06] text-base-content/30">Cerrada</span>
            </Show>
          </div>
          <button onClick={props.onClose} class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          {/* Title */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Título</label>
            <input
              type="text"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              placeholder="¿Qué necesitas que hagan?"
              autofocus
              class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/40 transition-all placeholder:text-base-content/20"
            />
          </div>

          {/* Assign to */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Asignar a</label>
            <div class="flex flex-wrap gap-1.5">
              <For each={activeMembers()}>
                {(member) => {
                  const selected = () => assignedTo() === member.id;
                  return (
                    <button
                      type="button"
                      onClick={() => setAssignedTo(selected() ? '' : member.id)}
                      class={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all ${
                        selected()
                          ? 'bg-purple-500/15 text-purple-500 ring-1 ring-purple-500/20'
                          : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08] hover:text-base-content/60'
                      }`}
                    >
                      <Show
                        when={member.avatar_url}
                        fallback={
                          <div class="w-4 h-4 rounded-full bg-base-content/10 flex items-center justify-center text-[7px] font-bold">
                            {member.name[0]}
                          </div>
                        }
                      >
                        <img src={member.avatar_url!} alt="" class="w-4 h-4 rounded-full object-cover" />
                      </Show>
                      {member.name.split(' ')[0]}
                    </button>
                  );
                }}
              </For>
            </div>
          </div>

          {/* Description */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Descripción <span class="text-base-content/15 normal-case">(opcional)</span></label>
            <textarea
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              placeholder="Detalles o contexto adicional..."
              rows={2}
              class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/40 transition-all resize-none placeholder:text-base-content/20"
            />
          </div>

          {/* Project + Due date row */}
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Proyecto <span class="text-base-content/15 normal-case">(opc.)</span></label>
              <select
                value={projectId()}
                onChange={(e) => setProjectId(e.currentTarget.value)}
                class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/40 transition-all appearance-none"
              >
                <option value="">Sin proyecto</option>
                <For each={activeProjects()}>
                  {(p) => <option value={p.id}>{p.name}</option>}
                </For>
              </select>
            </div>

            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider flex items-center gap-1">
                <CalendarDays size={9} />
                Fecha límite
              </label>
              <input
                type="date"
                value={dueDate()}
                onInput={(e) => setDueDate(e.currentTarget.value)}
                class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/40 transition-all"
              />
            </div>
          </div>

          {/* Error */}
          <Show when={error()}>
            <div class="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error()}
            </div>
          </Show>
        </div>

        {/* Footer */}
        <div class="flex items-center justify-between px-5 py-4 border-t border-base-content/[0.06]">
          <div class="flex items-center gap-2">
            <kbd class="text-[9px] text-base-content/15 font-mono">⌘↵</kbd>
            <Show when={isEdit()}>
              <Show
                when={!isClosed()}
                fallback={
                  <button
                    onClick={handleReopen}
                    disabled={closing()}
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-ios-blue-500 hover:bg-ios-blue-500/10 transition-all"
                  >
                    Reabrir
                  </button>
                }
              >
                <button
                  onClick={handleClose}
                  disabled={closing()}
                  class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-all"
                >
                  <XCircle size={12} />
                  Cerrar
                </button>
              </Show>
            </Show>
          </div>
          <div class="flex items-center gap-2">
            <button
              onClick={props.onClose}
              class="px-4 py-2 rounded-xl text-xs font-medium text-base-content/50 hover:bg-base-content/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit() || submitting()}
              class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Show when={submitting()}>
                <Loader2 size={13} class="animate-spin" />
              </Show>
              {submitting() ? 'Guardando...' : isEdit() ? 'Guardar cambios' : 'Crear encomienda'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateAssignmentModal;
