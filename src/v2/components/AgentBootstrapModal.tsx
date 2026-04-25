import {
  createResource,
  createSignal,
  createMemo,
  Show,
  For,
  type Component,
} from 'solid-js';
import { Sparkles, X, Copy, Check, Key, AlertTriangle, ChevronDown } from 'lucide-solid';
import { api, API_BASE, type Token } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Props {
  onClose: () => void;
  onOpenTokens: () => void;
}

const absApiBase = (): string => {
  if (API_BASE && API_BASE.length > 0) return API_BASE.replace(/\/$/, '');
  return window.location.origin;
};

const todayISO = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const AgentBootstrapModal: Component<Props> = (props) => {
  const auth = useAuth();
  const user = () => auth.user();

  const [tokens] = createResource(() => api.tokens.list());
  const activeTokens = (): Token[] =>
    (tokens() ?? []).filter(
      (t) => !t.revoked_at && (!t.expires_at || new Date(t.expires_at).getTime() > Date.now()),
    );

  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [picker, setPicker] = createSignal(false);

  const chosenToken = createMemo<Token | null>(() => {
    const list = activeTokens();
    if (list.length === 0) return null;
    const id = selectedId();
    return list.find((t) => t.id === id) ?? list[0];
  });

  const [rawToken] = createResource(chosenToken, async (t) => {
    if (!t) return null;
    const res = await api.tokens.reveal(t.id);
    return res.token;
  });

  const promptJson = createMemo(() => {
    const u = user();
    const t = rawToken();
    const base = absApiBase();
    const obj = {
      mission:
        `Operas Daily Check como ${u?.name ?? '...'}. Descubre capacidades vía /api/meta; pide datos solo cuando los necesites.`,
      identity: {
        user_id: u?.id ?? '',
        name: u?.name ?? '',
        role: u?.role ?? 'user',
      },
      api: {
        base_url: base,
        manifest: `${base}/api/meta`,
        auth: t ? `Bearer ${t}` : 'Bearer <reveal-pending>',
      },
      today: todayISO(),
    };
    return JSON.stringify(obj, null, 2);
  });

  const [copied, setCopied] = createSignal(false);
  const handleCopy = async () => {
    if (rawToken.loading || !rawToken()) return;
    try {
      await navigator.clipboard.writeText(promptJson());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = promptJson();
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const openTokens = () => {
    props.onOpenTokens();
    props.onClose();
  };

  return (
    <div
      class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-bootstrap-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-ios-blue-500/10 flex items-center justify-center text-ios-blue-500">
              <Sparkles size={15} />
            </div>
            <h2 id="agent-bootstrap-title" class="text-base font-semibold">
              Punto de entrada del agente
            </h2>
          </div>
          <button
            onClick={props.onClose}
            aria-label="Cerrar"
            class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          <Show
            when={!tokens.loading}
            fallback={
              <div class="h-64 flex items-center justify-center text-xs text-base-content/40">
                Cargando…
              </div>
            }
          >
            <Show
              when={activeTokens().length > 0}
              fallback={
                <div class="flex flex-col items-center gap-3 py-10 text-center">
                  <div class="w-10 h-10 rounded-full bg-base-content/[0.04] flex items-center justify-center text-base-content/30">
                    <Key size={18} />
                  </div>
                  <div class="space-y-1">
                    <p class="text-sm font-medium">Necesitas un token activo</p>
                    <p class="text-xs text-base-content/50 max-w-[280px]">
                      El agente usa un token para autenticarse contra la API. Crea uno y vuelve aquí.
                    </p>
                  </div>
                  <button
                    onClick={openTokens}
                    class="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-ios-blue-500 text-white text-xs font-semibold hover:bg-ios-blue-600 transition-colors"
                  >
                    <Key size={13} />
                    Crear token
                  </button>
                </div>
              }
            >
              {/* Token picker (only shown if multiple) */}
              <div class="relative">
                <button
                  type="button"
                  onClick={() => setPicker((v) => !v)}
                  class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-base-content/[0.04] hover:bg-base-content/[0.06] text-xs transition-colors"
                  aria-haspopup="listbox"
                  aria-expanded={picker()}
                  disabled={activeTokens().length === 1}
                >
                  <span class="flex items-center gap-2 min-w-0">
                    <Key size={12} class="text-base-content/40 shrink-0" />
                    <span class="font-medium truncate">{chosenToken()?.name ?? '…'}</span>
                    <span class="text-base-content/30 font-mono text-[10px] shrink-0">
                      {chosenToken()?.prefix}…
                    </span>
                  </span>
                  <Show when={activeTokens().length > 1}>
                    <ChevronDown
                      size={13}
                      class={`text-base-content/40 transition-transform ${picker() ? 'rotate-180' : ''}`}
                    />
                  </Show>
                </button>
                <Show when={picker() && activeTokens().length > 1}>
                  <div
                    role="listbox"
                    class="absolute left-0 right-0 top-[calc(100%+4px)] z-10 bg-base-100 border border-base-content/[0.08] rounded-xl shadow-lg py-1 max-h-56 overflow-y-auto"
                  >
                    <For each={activeTokens()}>
                      {(t) => {
                        const isActive = () => chosenToken()?.id === t.id;
                        return (
                          <button
                            type="button"
                            role="option"
                            aria-selected={isActive()}
                            onClick={() => {
                              setSelectedId(t.id);
                              setPicker(false);
                            }}
                            class={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                              isActive()
                                ? 'bg-ios-blue-500/10 text-ios-blue-500'
                                : 'hover:bg-base-content/5 text-base-content/80'
                            }`}
                          >
                            <span class="font-medium truncate flex-1 text-left">{t.name}</span>
                            <span class="font-mono text-[10px] text-base-content/40">
                              {t.prefix}…
                            </span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>

              {/* JSON prompt */}
              <div class="relative rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] overflow-hidden">
                <pre class="px-4 py-3 pr-12 text-[11px] leading-[1.55] font-mono text-base-content/80 overflow-x-auto whitespace-pre">
                  <Show when={!rawToken.loading} fallback={<span class="text-base-content/30">Revelando token…</span>}>
                    {promptJson()}
                  </Show>
                </pre>
                <button
                  onClick={handleCopy}
                  disabled={rawToken.loading || !rawToken()}
                  aria-label="Copiar"
                  class={`absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    copied()
                      ? 'bg-ios-green-500/15 text-ios-green-500'
                      : 'bg-base-100 text-base-content/70 hover:text-base-content border border-base-content/[0.08]'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Show when={copied()} fallback={<Copy size={12} />}>
                    <Check size={12} />
                  </Show>
                  {copied() ? 'Copiado' : 'Copiar'}
                </button>
              </div>

              <p class="text-[11px] text-base-content/50 leading-relaxed">
                Pégalo como mensaje inicial a tu agente (Claude, Cursor, Codex…). Descubrirá el resto vía <code class="font-mono text-[10px] bg-base-content/[0.06] px-1 py-px rounded">/api/meta</code>.
              </p>

              {/* Warning */}
              <div class="flex items-start gap-2 rounded-xl bg-amber-500/5 border border-amber-500/15 px-3 py-2.5">
                <AlertTriangle size={13} class="text-amber-500 shrink-0 mt-px" />
                <p class="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed flex-1">
                  Contiene tu token. Trátalo como una contraseña.{' '}
                  <button
                    onClick={openTokens}
                    class="underline underline-offset-2 hover:text-amber-500 font-medium"
                  >
                    Gestionar tokens
                  </button>
                </p>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default AgentBootstrapModal;
