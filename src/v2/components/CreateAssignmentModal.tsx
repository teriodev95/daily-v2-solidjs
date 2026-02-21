import { createSignal, For, Show, type Component } from 'solid-js';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { X, Loader2, CalendarDays } from 'lucide-solid';

interface CreateAssignmentModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const CreateAssignmentModal: Component<CreateAssignmentModalProps> = (props) => {
  const auth = useAuth();
  const data = useData();

  const [title, setTitle] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [assignedTo, setAssignedTo] = createSignal('');
  const [projectId, setProjectId] = createSignal('');
  const [dueDate, setDueDate] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  const activeMembers = () => data.users().filter(u => u.is_active && u.id !== auth.user()?.id);
  const activeProjects = () => data.projects().filter(p => p.status === 'active');

  const canSubmit = () => title().trim() && assignedTo();

  const handleSubmit = async () => {
    if (!canSubmit() || submitting()) return;
    setSubmitting(true);
    setError('');

    try {
      await api.assignments.create({
        assigned_to: assignedTo(),
        title: title().trim(),
        description: description().trim() || undefined,
        project_id: projectId() || undefined,
        due_date: dueDate() || undefined,
      });
      props.onCreated();
      props.onClose();
    } catch (e: any) {
      setError(e.message || 'Error al crear');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit on Cmd+Enter
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

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
            <h2 class="text-base font-semibold">Nueva encomienda</h2>
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
            {/* Project */}
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

            {/* Due date */}
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
          <kbd class="text-[9px] text-base-content/15 font-mono">⌘↵</kbd>
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
              {submitting() ? 'Creando...' : 'Crear encomienda'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateAssignmentModal;
