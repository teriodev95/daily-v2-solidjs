import { createSignal, For, Show, type Component } from 'solid-js';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { X, Loader2, RefreshCw } from 'lucide-solid';
import { frequencyLabel } from '../lib/recurrence';
import type { Story, Frequency } from '../types';

interface RecurringStoryModalProps {
  story?: Story;
  onClose: () => void;
  onSaved: () => void;
}

const DAY_LABELS = [
  { value: 1, short: 'L', name: 'Lun' },
  { value: 2, short: 'M', name: 'Mar' },
  { value: 3, short: 'M', name: 'Mié' },
  { value: 4, short: 'J', name: 'Jue' },
  { value: 5, short: 'V', name: 'Vie' },
  { value: 6, short: 'S', name: 'Sáb' },
  { value: 0, short: 'D', name: 'Dom' },
];

const RecurringStoryModal: Component<RecurringStoryModalProps> = (props) => {
  const data = useData();
  const isEdit = () => !!props.story;

  const [title, setTitle] = createSignal(props.story?.title ?? '');
  const [assigneeId, setAssigneeId] = createSignal(props.story?.assignee_id ?? '');
  const [assigneeIds, setAssigneeIds] = createSignal((props.story?.assignees ?? []).filter(id => id !== props.story?.assignee_id));
  const [frequency, setFrequency] = createSignal<Frequency>(props.story?.frequency ?? 'weekly');
  const [recurrenceDays, setRecurrenceDays] = createSignal<number[]>(props.story?.recurrence_days ?? [1, 2, 3, 4, 5]);
  const [dayOfMonth, setDayOfMonth] = createSignal(props.story?.day_of_month ?? 1);
  const [projectId, setProjectId] = createSignal(props.story?.project_id ?? '');
  const [submitting, setSubmitting] = createSignal(false);
  const [deactivating, setDeactivating] = createSignal(false);
  const [error, setError] = createSignal('');

  const activeMembers = () => data.users().filter(u => u.is_active);
  const activeProjects = () => data.projects().filter(p => p.status === 'active');

  const canSubmit = () => {
    if (!title().trim() || !assigneeId()) return false;
    if (frequency() === 'weekly' && recurrenceDays().length === 0) return false;
    return true;
  };

  const toggleDay = (day: number) => {
    setRecurrenceDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const toggleExtraAssignee = (userId: string) => {
    if (userId === assigneeId()) return;
    setAssigneeIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit() || submitting()) return;
    setSubmitting(true);
    setError('');

    const payload: Record<string, unknown> = {
      title: title().trim(),
      assignee_id: assigneeId(),
      assignees: assigneeIds(),
      frequency: frequency(),
      project_id: projectId() || null,
      status: 'todo',
      recurrence_days: frequency() === 'weekly' ? recurrenceDays() : null,
      day_of_week: null,
      day_of_month: frequency() === 'monthly' ? dayOfMonth() : null,
    };

    try {
      if (isEdit()) {
        await api.stories.update(props.story!.id, payload);
      } else {
        await api.stories.create(payload);
      }
      props.onSaved();
      props.onClose();
    } catch (e: any) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!props.story || deactivating()) return;
    setDeactivating(true);
    try {
      await api.stories.update(props.story.id, { is_active: false, frequency: null });
      props.onSaved();
      props.onClose();
    } catch (e: any) {
      setError(e.message || 'Error al desactivar');
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivate = async () => {
    if (!props.story || deactivating()) return;
    setDeactivating(true);
    try {
      await api.stories.update(props.story.id, { is_active: true, frequency: frequency() });
      props.onSaved();
      props.onClose();
    } catch (e: any) {
      setError(e.message || 'Error al reactivar');
    } finally {
      setDeactivating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isInactive = () => props.story && !props.story.is_active;

  return (
    <div
      class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div class="bg-base-100 w-full sm:max-w-4xl sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <RefreshCw size={12} class="text-purple-500" />
            </div>
            <h2 class="text-base font-semibold">{isEdit() ? 'Editar recurrente' : 'Nueva tarea recurrente'}</h2>
            <Show when={isInactive()}>
              <span class="text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-base-content/[0.06] text-base-content/30">Inactiva</span>
            </Show>
          </div>
          <button onClick={props.onClose} class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div class="px-5 py-4 grid gap-4 sm:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] sm:gap-5">
          <div class="space-y-4">
            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Título</label>
              <input
                type="text"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder="Ej: Revisar tickets de soporte"
                autofocus
                class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/40 transition-all placeholder:text-base-content/20"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Asignar a</label>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                <For each={activeMembers()}>
                  {(member) => {
                    const selected = () => assigneeId() === member.id;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          const next = selected() ? '' : member.id;
                          setAssigneeId(next);
                          if (next) setAssigneeIds(prev => prev.filter(id => id !== next));
                        }}
                        class={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-[11px] font-medium transition-all ${
                          selected()
                            ? 'bg-purple-500/15 text-purple-500 ring-1 ring-purple-500/20'
                            : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08] hover:text-base-content/60'
                        }`}
                      >
                        <Show
                          when={member.avatar_url}
                          fallback={
                            <div class="w-5 h-5 rounded-full bg-base-content/10 flex items-center justify-center text-[8px] font-bold">
                              {member.name[0]}
                            </div>
                          }
                        >
                          <img src={member.avatar_url!} alt="" class="w-5 h-5 rounded-full object-cover" />
                        </Show>
                        <span class="truncate">{member.name.split(' ')[0]}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Involucrados <span class="text-base-content/15 normal-case">(opcionales)</span></label>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                <For each={activeMembers().filter(member => member.id !== assigneeId())}>
                  {(member) => {
                    const selected = () => assigneeIds().includes(member.id);
                    return (
                      <button
                        type="button"
                        onClick={() => toggleExtraAssignee(member.id)}
                        class={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-[11px] font-medium transition-all ${
                          selected()
                            ? 'bg-ios-blue-500/15 text-ios-blue-400 ring-1 ring-ios-blue-500/20'
                            : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08] hover:text-base-content/60'
                        }`}
                      >
                        <Show
                          when={member.avatar_url}
                          fallback={
                            <div class="w-5 h-5 rounded-full bg-base-content/10 flex items-center justify-center text-[8px] font-bold">
                              {member.name[0]}
                            </div>
                          }
                        >
                          <img src={member.avatar_url!} alt="" class="w-5 h-5 rounded-full object-cover" />
                        </Show>
                        <span class="truncate">{member.name.split(' ')[0]}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Frecuencia</label>
              <div class="flex gap-1.5">
                {(['daily', 'weekly', 'monthly'] as Frequency[]).map((f) => {
                  const labels: Record<Frequency, string> = { daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual' };
                  return (
                    <button
                      type="button"
                      onClick={() => setFrequency(f)}
                      class={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        frequency() === f
                          ? 'bg-purple-500/15 text-purple-500 ring-1 ring-purple-500/20'
                          : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
                      }`}
                    >
                      {labels[f]}
                    </button>
                  );
                })}
              </div>
            </div>

            <Show when={frequency() === 'weekly'}>
              <div class="space-y-1.5">
                <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Días de la semana</label>
                <div class="flex gap-1.5">
                  <For each={DAY_LABELS}>
                    {(day) => {
                      const selected = () => recurrenceDays().includes(day.value);
                      return (
                        <button
                          type="button"
                          onClick={() => toggleDay(day.value)}
                          class={`w-9 h-9 rounded-full text-xs font-bold transition-all ${
                            selected()
                              ? 'bg-purple-500 text-white shadow-md shadow-purple-500/30'
                              : 'bg-base-content/[0.04] text-base-content/30 hover:bg-base-content/[0.08] hover:text-base-content/50'
                          }`}
                          title={day.name}
                        >
                          {day.short}
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={frequency() === 'monthly'}>
              <div class="space-y-1.5">
                <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Día del mes</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth()}
                  onInput={(e) => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.currentTarget.value) || 1)))}
                  class="w-24 px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/40 transition-all"
                />
              </div>
            </Show>

            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Proyecto <span class="text-base-content/15 normal-case">(opcional)</span></label>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setProjectId('')}
                  class={`rounded-2xl border px-3 py-2.5 text-left text-[12px] font-semibold transition-all ${
                    !projectId()
                      ? 'border-purple-500/25 bg-purple-500/12 text-purple-400'
                      : 'border-base-content/[0.06] bg-base-content/[0.03] text-base-content/50'
                  }`}
                >
                  <span class="block">Sin proyecto</span>
                  <span class="mt-1 block text-[10px] opacity-70">Libre / general</span>
                </button>
                <For each={activeProjects()}>
                  {(project) => (
                    <button
                      type="button"
                      onClick={() => setProjectId(project.id)}
                      class={`rounded-2xl border px-3 py-2.5 text-left transition-all ${
                        projectId() === project.id
                          ? 'border-transparent shadow-sm'
                          : 'border-base-content/[0.06] bg-base-content/[0.03]'
                      }`}
                      style={projectId() === project.id ? {
                        'background-color': `${project.color}18`,
                        color: project.color,
                        'box-shadow': `inset 0 0 0 1px ${project.color}33`,
                      } : undefined}
                    >
                      <div class="flex items-center gap-2">
                        <div class="w-2.5 h-2.5 rounded-full" style={{ 'background-color': project.color }} />
                        <span class="truncate text-[12px] font-bold">{project.prefix}</span>
                      </div>
                      <span class="block mt-1 truncate text-[10px] opacity-75">{project.name}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>

          <Show when={error()}>
            <div class="sm:col-span-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
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
                when={!isInactive()}
                fallback={
                  <button
                    onClick={handleReactivate}
                    disabled={deactivating()}
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-ios-blue-500 hover:bg-ios-blue-500/10 transition-all"
                  >
                    Reactivar
                  </button>
                }
              >
                <button
                  onClick={handleDeactivate}
                  disabled={deactivating()}
                  class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-all"
                >
                  Desactivar
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
              {submitting() ? 'Guardando...' : isEdit() ? 'Guardar cambios' : 'Crear recurrente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecurringStoryModal;
