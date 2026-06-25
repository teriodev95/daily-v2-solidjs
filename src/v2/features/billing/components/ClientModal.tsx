import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import { X, Loader2, Building2 } from 'lucide-solid';
import { api } from '../../../lib/api';
import { billingApi } from '../lib/api';
import type { Client } from '../types';

interface Props {
  client?: Client;
  onClose: () => void;
  onSaved: (client: Client) => void;
}

const labelClass = 'text-[10px] font-semibold uppercase text-base-content/30 tracking-wider';
const inputClass =
  'w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all';

const ClientModal: Component<Props> = (props) => {
  const isEdit = () => !!props.client;

  const [name, setName] = createSignal(props.client?.name ?? '');
  const [razonSocial, setRazonSocial] = createSignal(props.client?.razon_social ?? '');
  const [rfc, setRfc] = createSignal(props.client?.rfc ?? '');
  const [projectId, setProjectId] = createSignal<string | null>(props.client?.project_id ?? null);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  const [projects] = createResource(() => api.projects.list('active'));

  const canSubmit = () => name().trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit() || submitting()) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        name: name().trim(),
        razon_social: razonSocial().trim(),
        rfc: rfc().trim(),
        project_id: projectId(),
      };
      const saved = isEdit()
        ? await billingApi.clients.update(props.client!.id, payload)
        : await billingApi.clients.create(payload);
      props.onSaved(saved);
      props.onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting()) props.onClose(); }}
    >
      <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-ios-blue-500/10 text-ios-blue-500">
              <Building2 size={18} />
            </div>
            <h2 class="text-base font-semibold">{isEdit() ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          </div>
          <button onClick={props.onClose} aria-label="Cerrar" class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          <div class="space-y-1.5">
            <label class={labelClass}>Nombre</label>
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Nombre comercial"
              class={inputClass}
            />
          </div>

          <div class="space-y-1.5">
            <label class={labelClass}>Razón social</label>
            <input
              type="text"
              value={razonSocial()}
              onInput={(e) => setRazonSocial(e.currentTarget.value)}
              placeholder="Razón social fiscal"
              class={inputClass}
            />
          </div>

          <div class="space-y-1.5">
            <label class={labelClass}>RFC</label>
            <input
              type="text"
              value={rfc()}
              onInput={(e) => setRfc(e.currentTarget.value.toUpperCase())}
              placeholder="XAXX010101000"
              class={`${inputClass} font-mono uppercase`}
            />
          </div>

          <div class="space-y-1.5">
            <label class={labelClass}>Proyecto (opcional)</label>
            <select
              value={projectId() ?? ''}
              onChange={(e) => setProjectId(e.currentTarget.value || null)}
              class={inputClass}
            >
              <option value="">Sin proyecto</option>
              <For each={projects() ?? []}>
                {(p) => <option value={p.id}>{p.name}</option>}
              </For>
            </select>
          </div>

          <Show when={error()}>
            <div class="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error()}
            </div>
          </Show>
        </div>

        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-base-content/[0.06]">
          <button onClick={props.onClose} class="px-4 py-2 rounded-xl text-xs font-medium text-base-content/50 hover:bg-base-content/5 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting()}
            class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-ios-blue-500 text-white hover:bg-ios-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Show when={submitting()}><Loader2 size={13} class="animate-spin" /></Show>
            {submitting() ? 'Guardando...' : isEdit() ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientModal;
