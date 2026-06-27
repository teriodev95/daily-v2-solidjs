import { createSignal, createMemo, onCleanup, onMount, Show, For, type Component } from 'solid-js';
import { X, Lock, Eye, EyeOff, Copy, Check, AlertCircle, Link } from 'lucide-solid';
import { api, type SecretMeta } from '../../lib/api';

interface Props {
  secret: SecretMeta;
  onClose: () => void;
  // Reveal is audited; the parent can refresh the list's last_event.
  onRevealed?: () => void;
}

const writeToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  if (!ok) throw new Error('clipboard-unavailable');
};

type Field = { label: string | null; value: string };

// Presentation-only parsing. The stored/copied blob is never altered: we only
// split it into rows for display. A line is shown as a labeled field when it
// looks like `KEY=VALUE` or `KEY: VALUE` (colon + whitespace, so bare URLs such
// as `https://…` are NOT mistaken for a label).
const KV_EQ = /^\s*([A-Za-z0-9_.\-]+)\s*=\s*(.*)$/;
const KV_COLON = /^\s*([A-Za-z0-9_.\-]+):\s+(.*)$/;

const parseField = (line: string): Field => {
  const m = line.match(KV_EQ) ?? line.match(KV_COLON);
  if (m) return { label: m[1], value: m[2] };
  return { label: null, value: line };
};

const isUrl = (v: string) => /^https?:\/\//i.test(v.trim());

/**
 * Compact sheet that reveals a single secret's plaintext value.
 *
 * The plaintext lives ONLY in this component's local state while it is mounted;
 * `onCleanup` wipes it, so the value never lingers after the sheet closes.
 */
const SecretRevealSheet: Component<Props> = (props) => {
  const [value, setValue] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [shown, setShown] = createSignal(false);
  const [copiedId, setCopiedId] = createSignal<string | null>(null);
  const [error, setError] = createSignal('');

  let alive = true;

  // Each non-empty line becomes a row. The original blob is preserved for
  // "Copiar todo"; this only drives how the value is laid out on screen.
  const fields = createMemo<Field[]>(() => {
    const v = value();
    if (v == null) return [];
    return v
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .map(parseField);
  });

  // Multi-field whenever there is more than one row, or a single row that
  // carries a label. A lone unlabeled line stays a clean single field.
  const isMulti = createMemo(() => {
    const f = fields();
    return f.length > 1 || (f.length === 1 && f[0].label !== null);
  });

  onMount(async () => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      alive = false;
      document.removeEventListener('keydown', onKey);
      // Wipe the plaintext from memory.
      setValue(null);
    });

    try {
      const res = await api.secrets.reveal(props.secret.id);
      if (alive) {
        setValue(res.value);
        props.onRevealed?.();
      }
    } catch (e: any) {
      if (alive) setError(e?.message ?? 'No se pudo revelar el secreto');
    } finally {
      if (alive) setLoading(false);
    }
  });

  const copyText = async (text: string, id: string) => {
    try {
      await writeToClipboard(text);
      setCopiedId(id);
      setTimeout(() => alive && setCopiedId((c) => (c === id ? null : c)), 2000);
    } catch (e: any) {
      setError(
        e?.message === 'clipboard-unavailable'
          ? 'Tu navegador no permite copiar. Usa HTTPS o copia manualmente.'
          : 'No se pudo copiar el valor',
      );
    }
  };

  // Small copy button reused by every field and by "Copiar todo".
  const CopyBtn: Component<{ id: string; text: string; label?: string }> = (p) => {
    const done = () => copiedId() === p.id;
    return (
      <button
        type="button"
        onClick={() => copyText(p.text, p.id)}
        disabled={loading()}
        aria-label={p.label ?? 'Copiar valor'}
        class={`shrink-0 rounded-lg p-1.5 transition-all disabled:opacity-40 ${
          done()
            ? 'bg-ios-green-500/15 text-ios-green-500'
            : 'text-base-content/40 hover:bg-base-content/5 hover:text-base-content/80'
        }`}
      >
        <Show when={done()} fallback={<Copy size={15} />}>
          <Check size={15} />
        </Show>
      </button>
    );
  };

  return (
    <div
      class="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-reveal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="w-full overflow-hidden rounded-t-[24px] bg-base-100 shadow-2xl sm:max-w-md sm:rounded-[24px]">
        {/* Header */}
        <div class="flex items-start justify-between gap-3 border-b border-base-content/[0.06] px-5 py-4">
          <div class="flex min-w-0 items-start gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ios-blue-500/10 text-ios-blue-500">
              <Lock size={17} />
            </div>
            <div class="min-w-0">
              <h2 id="secret-reveal-title" class="truncate text-[15px] font-semibold">{props.secret.name}</h2>
              <p class="mt-0.5 truncate font-mono text-[11px] text-base-content/40">{props.secret.key}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Cerrar"
            class="-mr-1 shrink-0 rounded-lg p-1.5 text-base-content/40 transition-colors hover:bg-base-content/5"
          >
            <X size={18} />
          </button>
        </div>

        <div class="space-y-3 px-5 py-4">
          <Show
            when={!error()}
            fallback={
              <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-red-500">
                <AlertCircle size={15} class="mt-0.5 shrink-0" />
                <p class="text-xs">{error()}</p>
              </div>
            }
          >
            <Show
              when={!loading()}
              fallback={
                <div class="flex items-center gap-2.5 rounded-xl border border-base-content/[0.08] bg-base-content/[0.04] px-3.5 py-3 text-xs text-base-content/45">
                  <span class="h-4 w-4 animate-spin rounded-full border-2 border-base-content/20 border-t-base-content/60" />
                  Revelando…
                </div>
              }
            >
              <Show
                when={isMulti()}
                fallback={
                  // Single, clean value.
                  <div class="relative">
                    <input
                      type={shown() ? 'text' : 'password'}
                      readonly
                      value={value() ?? ''}
                      onClick={(e) => shown() && e.currentTarget.select()}
                      class="w-full rounded-xl border border-base-content/[0.08] bg-base-content/[0.04] px-3.5 py-3 pr-[5.5rem] font-mono text-xs text-base-content/90 focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30"
                    />
                    <div class="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShown((v) => !v)}
                        disabled={!value()}
                        aria-label={shown() ? 'Ocultar valor' : 'Mostrar valor'}
                        class="rounded-lg p-1.5 text-base-content/40 transition-all hover:bg-base-content/5 hover:text-base-content/80 disabled:opacity-40"
                      >
                        <Show when={shown()} fallback={<Eye size={15} />}>
                          <EyeOff size={15} />
                        </Show>
                      </button>
                      <CopyBtn id="single" text={value() ?? ''} />
                    </div>
                  </div>
                }
              >
                {/* Multi-field: one row per line, masked, each copyable. */}
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2 px-0.5">
                    <span class="text-[11px] font-medium text-base-content/40">
                      {fields().length} campos
                    </span>
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShown((v) => !v)}
                        class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-base-content/50 transition-colors hover:bg-base-content/5 hover:text-base-content/80"
                      >
                        <Show when={shown()} fallback={<Eye size={13} />}>
                          <EyeOff size={13} />
                        </Show>
                        {shown() ? 'Ocultar' : 'Mostrar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(value() ?? '', 'all')}
                        class={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                          copiedId() === 'all'
                            ? 'bg-ios-green-500/15 text-ios-green-500'
                            : 'text-ios-blue-500 hover:bg-ios-blue-500/10'
                        }`}
                      >
                        <Show when={copiedId() === 'all'} fallback={<Copy size={13} />}>
                          <Check size={13} />
                        </Show>
                        Copiar todo
                      </button>
                    </div>
                  </div>

                  <For each={fields()}>
                    {(f, i) => {
                      const url = isUrl(f.value);
                      return (
                        <div class="rounded-xl border border-base-content/[0.08] bg-base-content/[0.04] px-3 py-2">
                          <Show when={f.label}>
                            <div class="mb-1 flex items-center gap-1.5">
                              <span class="truncate font-mono text-[10.5px] font-semibold uppercase tracking-wide text-base-content/45">
                                {f.label}
                              </span>
                              <Show when={url}>
                                <Link size={11} class="shrink-0 text-ios-blue-500/70" />
                              </Show>
                            </div>
                          </Show>
                          <div class="flex items-center gap-1.5">
                            <Show when={url && !f.label}>
                              <Link size={13} class="shrink-0 text-ios-blue-500/70" />
                            </Show>
                            <input
                              type={shown() ? 'text' : 'password'}
                              readonly
                              value={f.value}
                              onClick={(e) => shown() && e.currentTarget.select()}
                              class={`min-w-0 flex-1 bg-transparent font-mono text-xs focus:outline-none ${
                                url && shown() ? 'text-ios-blue-500' : 'text-base-content/90'
                              }`}
                            />
                            <CopyBtn id={`f-${i()}`} text={f.value} label={f.label ? `Copiar ${f.label}` : 'Copiar valor'} />
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </Show>

            <div class="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2.5 text-amber-600 dark:text-amber-400">
              <AlertCircle size={14} class="mt-0.5 shrink-0" />
              <p class="text-[11px] leading-relaxed">
                El valor se borra de la pantalla al cerrar. Esta revelación queda registrada en la auditoría.
              </p>
            </div>
          </Show>
        </div>

        <div class="flex justify-end border-t border-base-content/[0.06] px-5 py-3.5">
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-xl bg-base-content px-4 py-2 text-sm font-semibold text-base-100 transition-opacity hover:opacity-90"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecretRevealSheet;
