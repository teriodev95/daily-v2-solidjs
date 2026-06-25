import { createSignal, Show, type Component } from 'solid-js';
import { X, Loader2, CalendarClock } from 'lucide-solid';
import { billingApi } from '../lib/api';
import type { Schedule, ScheduleKind } from '../types';

interface Props {
  clientId: string;
  schedule?: Schedule;
  onClose: () => void;
  onSaved: () => void;
}

const labelClass = 'text-[10px] font-semibold uppercase text-base-content/30 tracking-wider';
const inputClass =
  'w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all';

const ScheduleModal: Component<Props> = (props) => {
  const isEdit = () => !!props.schedule;

  const [day, setDay] = createSignal(String(props.schedule?.day_of_month ?? 1));
  const [amount, setAmount] = createSignal(String(props.schedule?.amount ?? ''));
  const [kind, setKind] = createSignal<ScheduleKind>(props.schedule?.kind ?? 'fixed');
  const [description, setDescription] = createSignal(props.schedule?.description ?? '');
  const [isActive, setIsActive] = createSignal(props.schedule?.is_active ?? true);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  const dayNum = () => Math.min(31, Math.max(1, parseInt(day(), 10) || 1));
  const canSubmit = () => {
    const a = parseFloat(amount());
    return Number.isFinite(a) && a >= 0;
  };

  const handleSubmit = async () => {
    if (!canSubmit() || submitting()) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        client_id: props.clientId,
        day_of_month: dayNum(),
        amount: parseFloat(amount()) || 0,
        kind: kind(),
        description: description().trim(),
        is_active: isActive(),
      };
      if (isEdit()) await billingApi.schedules.update(props.schedule!.id, payload);
      else await billingApi.schedules.create(payload);
      props.onSaved();
      props.onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting()) props.onClose(); }}
    >
      <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-ios-blue-500/10 text-ios-blue-500">
              <CalendarClock size={18} />
            </div>
            <h2 class="text-base font-semibold">{isEdit() ? 'Editar programación' : 'Nueva programación'}</h2>
          </div>
          <button onClick={props.onClose} aria-label="Cerrar" class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class={labelClass}>Día del mes</label>
              <input
                type="number"
                min="1"
                max="31"
                value={day()}
                onInput={(e) => setDay(e.currentTarget.value)}
                class={inputClass}
              />
            </div>
            <div class="space-y-1.5">
              <label class={labelClass}>Monto</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount()}
                onInput={(e) => setAmount(e.currentTarget.value)}
                placeholder="0.00"
                class={inputClass}
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class={labelClass}>Tipo</label>
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => setKind('fixed')}
                class={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  kind() === 'fixed'
                    ? 'bg-ios-blue-500/15 text-ios-blue-500 ring-1 ring-ios-blue-500/20'
                    : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
                }`}
              >
                Fijo
              </button>
              <button
                type="button"
                onClick={() => setKind('variable')}
                class={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  kind() === 'variable'
                    ? 'bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/20'
                    : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
                }`}
              >
                Variable
              </button>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class={labelClass}>Descripción</label>
            <input
              type="text"
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              placeholder="Renta mensual, mantenimiento…"
              class={inputClass}
            />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs font-medium">Activa</p>
              <p class="text-[10px] text-base-content/30">{isActive() ? 'Se considera en el ciclo de cobro' : 'Pausada'}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive())}
              aria-pressed={isActive()}
              class={`relative w-11 h-6 rounded-full transition-colors ${isActive() ? 'bg-ios-green-500' : 'bg-base-content/15'}`}
            >
              <div class={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${isActive() ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <Show when={error()}>
            <div class="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error()}</div>
          </Show>
        </div>

        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-base-content/[0.06]">
          <button onClick={props.onClose} class="px-4 py-2 rounded-xl text-xs font-medium text-base-content/50 hover:bg-base-content/5 transition-colors">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting()}
            class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-ios-blue-500 text-white hover:bg-ios-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Show when={submitting()}><Loader2 size={13} class="animate-spin" /></Show>
            {submitting() ? 'Guardando...' : isEdit() ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleModal;
