import { createSignal, createMemo, onCleanup, onMount, Show, For, type Component } from 'solid-js';
import { X, Key, Eye, PenLine, Sparkles, BookOpen, AlertCircle } from 'lucide-solid';
import { api, type CreatedToken, type TokenScope } from '../../lib/api';
import PermissionMatrix, { MODULES, emptyScopes } from './PermissionMatrix';

interface Props {
  onClose: () => void;
  onCreated: (token: CreatedToken) => void;
}

type PresetId = 'read' | 'wiki' | 'full' | 'custom';

const EXPIRATION_OPTIONS: { label: string; days: number | null }[] = [
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
  { label: '1 año', days: 365 },
  { label: 'Nunca', days: null },
];

const PRESETS: { id: PresetId; label: string; icon: any }[] = [
  { id: 'read', label: 'Solo lectura', icon: Eye },
  { id: 'wiki', label: 'Solo Wiki', icon: BookOpen },
  { id: 'full', label: 'Acceso completo', icon: Sparkles },
  { id: 'custom', label: 'Personalizado', icon: PenLine },
];

const applyPreset = (preset: PresetId): Record<string, TokenScope> => {
  const base = emptyScopes();
  if (preset === 'read') {
    for (const m of MODULES) base[m.key] = 'read';
  } else if (preset === 'wiki') {
    base.wiki = 'write';
  } else if (preset === 'full') {
    for (const m of MODULES) base[m.key] = 'write';
  }
  return base;
};

const scopesMatchPreset = (
  scopes: Record<string, TokenScope>,
  preset: PresetId,
): boolean => {
  if (preset === 'custom') return false;
  const expected = applyPreset(preset);
  return MODULES.every((m) => expected[m.key] === (scopes[m.key] ?? 'none'));
};

const CreateTokenModal: Component<Props> = (props) => {
  const [name, setName] = createSignal('');
  const [expirationDays, setExpirationDays] = createSignal<number | null>(90);
  const [scopes, setScopes] = createSignal<Record<string, TokenScope>>(
    applyPreset('read'),
  );
  const [preset, setPreset] = createSignal<PresetId>('read');
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  const handlePresetClick = (id: PresetId) => {
    setPreset(id);
    if (id !== 'custom') {
      setScopes(applyPreset(id));
    }
  };

  const handleMatrixChange = (next: Record<string, TokenScope>) => {
    setScopes(next);
    // Detect if still matches a known preset, else mark as custom
    const match = (['read', 'wiki', 'full'] as PresetId[]).find((p) =>
      scopesMatchPreset(next, p),
    );
    setPreset(match ?? 'custom');
  };

  const summary = createMemo(() => {
    const s = scopes();
    let write = 0;
    let read = 0;
    let none = 0;
    for (const m of MODULES) {
      const v = s[m.key] ?? 'none';
      if (v === 'write') write++;
      else if (v === 'read') read++;
      else none++;
    }
    return { write, read, none };
  });

  const canSubmit = () => name().trim().length > 0 && !submitting();

  const expirationLabel = () => {
    const d = expirationDays();
    if (d === null) return 'Sin expiración';
    return `Expira en ${d} ${d === 1 ? 'día' : 'días'}`;
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting()) {
        e.preventDefault();
        props.onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    onCleanup(() => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    });
  });

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setSubmitting(true);
    setError('');
    try {
      const created = await api.tokens.create({
        name: name().trim(),
        scopes: scopes(),
        expires_in_days: expirationDays(),
      });
      props.onCreated(created);
    } catch (e: any) {
      setError(e?.message ?? 'Error al crear el token');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-token-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting()) props.onClose();
      }}
    >
      <div class="bg-base-100 w-full sm:max-w-2xl sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div class="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06] bg-base-100/90 backdrop-blur-md">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-ios-blue-500/10 flex items-center justify-center text-ios-blue-500">
              <Key size={15} />
            </div>
            <h2 id="create-token-title" class="text-base font-semibold">Nuevo token</h2>
          </div>
          <button
            onClick={props.onClose}
            aria-label="Cerrar"
            class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div class="px-5 py-5 space-y-6">
          {/* ─── Section 1: Identity ─── */}
          <section class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-semibold uppercase text-base-content/50 tracking-wider">
                1. Identidad
              </span>
              <div class="flex-1 h-px bg-base-content/[0.06]" />
            </div>

            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">
                Nombre
              </label>
              <input
                type="text"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value.slice(0, 50))}
                placeholder="p. ej. Claude Agent"
                maxLength={50}
                class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
              />
              <div class="flex justify-between text-[10px] text-base-content/30">
                <span>Un nombre descriptivo para identificarlo después</span>
                <span>{name().length}/50</span>
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">
                Expiración
              </label>
              <div class="flex flex-wrap gap-1.5">
                <For each={EXPIRATION_OPTIONS}>
                  {(opt) => {
                    const active = () => expirationDays() === opt.days;
                    return (
                      <button
                        type="button"
                        onClick={() => setExpirationDays(opt.days)}
                        class={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border ${
                          active()
                            ? 'bg-ios-blue-500/10 text-ios-blue-500 border-ios-blue-500/30'
                            : 'bg-base-content/[0.03] text-base-content/50 border-base-content/[0.06] hover:text-base-content/80'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </section>

          {/* ─── Section 2: Permissions ─── */}
          <section class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-semibold uppercase text-base-content/50 tracking-wider">
                2. Permisos
              </span>
              <div class="flex-1 h-px bg-base-content/[0.06]" />
            </div>

            <div class="flex flex-wrap gap-1.5">
              <For each={PRESETS}>
                {(p) => {
                  const active = () => preset() === p.id;
                  return (
                    <button
                      type="button"
                      onClick={() => handlePresetClick(p.id)}
                      class={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        active()
                          ? 'bg-base-content text-base-100 border-base-content'
                          : 'bg-base-content/[0.03] text-base-content/50 border-base-content/[0.06] hover:text-base-content/80'
                      }`}
                    >
                      <p.icon size={12} />
                      {p.label}
                    </button>
                  );
                }}
              </For>
            </div>

            <PermissionMatrix value={scopes()} onChange={handleMatrixChange} />
          </section>

          {/* ─── Section 3: Summary & Action ─── */}
          <section class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-semibold uppercase text-base-content/50 tracking-wider">
                3. Resumen
              </span>
              <div class="flex-1 h-px bg-base-content/[0.06]" />
            </div>

            <div class="flex flex-wrap gap-1.5">
              <span class="text-[11px] px-2.5 py-1 rounded-full bg-ios-blue-500/10 text-ios-blue-500 font-medium">
                {summary().write} con escritura
              </span>
              <span class="text-[11px] px-2.5 py-1 rounded-full bg-ios-green-500/10 text-ios-green-500 font-medium">
                {summary().read} con lectura
              </span>
              <span class="text-[11px] px-2.5 py-1 rounded-full bg-base-content/[0.06] text-base-content/50 font-medium">
                {summary().none} sin acceso
              </span>
              <span class="text-[11px] px-2.5 py-1 rounded-full bg-base-content/[0.06] text-base-content/50 font-medium">
                {expirationLabel()}
              </span>
            </div>

            <Show when={error()}>
              <div class="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-red-500">
                <AlertCircle size={14} class="mt-0.5 shrink-0" />
                <p class="text-xs">{error()}</p>
              </div>
            </Show>
          </section>
        </div>

        {/* Footer */}
        <div class="sticky bottom-0 px-5 py-3.5 border-t border-base-content/[0.06] bg-base-100/90 backdrop-blur-md flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            class="px-4 py-2 rounded-xl text-sm font-medium text-base-content/60 hover:bg-base-content/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit()}
            class="px-4 py-2 rounded-xl bg-ios-blue-500 text-white text-sm font-semibold hover:bg-ios-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting() ? 'Creando...' : 'Crear Token'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateTokenModal;
