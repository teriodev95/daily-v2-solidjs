import { createSignal, For, Show, type Component } from 'solid-js';
import type { Project, ProjectStatus } from '../types';
import { api } from '../lib/api';
import { X, Loader2 } from 'lucide-solid';

interface ProjectModalProps {
  project?: Project;
  onClose: () => void;
  onSaved: () => void;
}

const COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#14B8A6', // teal
  '#06B6D4', // cyan
  '#6366F1', // indigo
];

const ProjectModal: Component<ProjectModalProps> = (props) => {
  const isEdit = () => !!props.project;

  const [name, setName] = createSignal(props.project?.name ?? '');
  const [prefix, setPrefix] = createSignal(props.project?.prefix ?? '');
  const [color, setColor] = createSignal(props.project?.color ?? COLORS[0]);
  const [status, setStatus] = createSignal<ProjectStatus>(props.project?.status ?? 'active');
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  const canSubmit = () => name().trim() && prefix().trim() && color();

  const handleSubmit = async () => {
    if (!canSubmit() || submitting()) return;
    setSubmitting(true);
    setError('');

    try {
      if (isEdit()) {
        const payload: Record<string, unknown> = {};
        if (name() !== props.project!.name) payload.name = name();
        if (prefix() !== props.project!.prefix) payload.prefix = prefix();
        if (color() !== props.project!.color) payload.color = color();
        if (status() !== props.project!.status) payload.status = status();

        if (Object.keys(payload).length > 0) {
          await api.projects.update(props.project!.id, payload);
        }
      } else {
        await api.projects.create({
          name: name(),
          prefix: prefix(),
          color: color(),
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

  return (
    <div
      class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div class="bg-base-100 w-full sm:max-w-md sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <h2 class="text-base font-semibold">{isEdit() ? 'Editar proyecto' : 'Nuevo proyecto'}</h2>
          <button onClick={props.onClose} class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          {/* Preview */}
          <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-base-content/[0.03] border border-base-content/[0.06]">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ background: color() }}>
              {prefix() ? prefix().slice(0, 2).toUpperCase() : '?'}
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">{name() || 'Nombre del proyecto'}</p>
              <p class="text-[10px] text-base-content/30">{prefix() || 'PRE'}-001</p>
            </div>
          </div>

          {/* Name */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Nombre</label>
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Mi Proyecto"
              class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
            />
          </div>

          {/* Prefix */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Prefijo</label>
            <input
              type="text"
              value={prefix()}
              onInput={(e) => setPrefix(e.currentTarget.value.toUpperCase())}
              placeholder="HU"
              maxLength={5}
              class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
            />
            <p class="text-[9px] text-base-content/20">Se usará como prefijo de las HUs (ej: {prefix() || 'HU'}-001)</p>
          </div>

          {/* Color */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Color</label>
            <div class="flex flex-wrap gap-2">
              <For each={COLORS}>
                {(c) => (
                  <button
                    type="button"
                    onClick={() => setColor(c)}
                    class={`w-8 h-8 rounded-lg transition-all ${
                      color() === c ? 'ring-2 ring-offset-2 ring-offset-base-100 scale-110' : 'hover:scale-110'
                    }`}
                    style={{ background: c, 'ring-color': color() === c ? c : undefined }}
                  />
                )}
              </For>
            </div>
          </div>

          {/* Status (only on edit) */}
          <Show when={isEdit()}>
            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">Estado</label>
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('active')}
                  class={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    status() === 'active'
                      ? 'bg-ios-green-500/15 text-ios-green-500 ring-1 ring-ios-green-500/20'
                      : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
                  }`}
                >
                  Activo
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('archived')}
                  class={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    status() === 'archived'
                      ? 'bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/20'
                      : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
                  }`}
                >
                  Archivado
                </button>
              </div>
            </div>
          </Show>

          {/* Error */}
          <Show when={error()}>
            <div class="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error()}
            </div>
          </Show>
        </div>

        {/* Footer */}
        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-base-content/[0.06]">
          <button
            onClick={props.onClose}
            class="px-4 py-2 rounded-xl text-xs font-medium text-base-content/50 hover:bg-base-content/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting()}
            class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-ios-blue-500 text-white hover:bg-ios-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Show when={submitting()}>
              <Loader2 size={13} class="animate-spin" />
            </Show>
            {submitting() ? 'Guardando...' : isEdit() ? 'Guardar cambios' : 'Crear proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectModal;
