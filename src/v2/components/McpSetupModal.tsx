import { createResource, createSignal, Show, type Component } from 'solid-js';
import { Plug, X } from 'lucide-solid';
import { api, type Token } from '../lib/api';
import McpSetupPanel from './tokens/McpSetupPanel';

/**
 * Instrucciones de conexión MCP como modal, accesible desde el menú de usuario.
 *
 * El contenido es el mismo panel que vive en la pestaña MCP de API Tokens: la
 * pantalla completa sirve para configurar con calma, y este modal para cuando
 * solo hace falta copiar la configuración y volver a lo que estabas haciendo.
 */
interface Props {
  onClose: () => void;
  onOpenTokens: () => void;
}

const McpSetupModal: Component<Props> = (props) => {
  const [tokens] = createResource(() => api.tokens.list());
  const [toast, setToast] = createSignal<{ type: 'ok' | 'error'; message: string } | null>(null);

  // Un token caducado no sirve para conectar: se filtra igual que en el punto
  // de entrada del agente.
  const activeTokens = (): Token[] =>
    (tokens() ?? []).filter(
      (t) => !t.revoked_at && (!t.expires_at || new Date(t.expires_at).getTime() > Date.now()),
    );

  const showToast = (type: 'ok' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2600);
  };

  const writeToClipboard = async (text: string): Promise<void> => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Respaldo para contextos inseguros o navegadores viejos.
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

  return (
    <div
      class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mcp-setup-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-ios-blue-500/10 flex items-center justify-center text-ios-blue-500">
              <Plug size={15} />
            </div>
            <h2 id="mcp-setup-title" class="text-base font-semibold">
              Conectar por MCP
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

        <div class="px-5 py-4">
          <Show
            when={!tokens.loading}
            fallback={
              <div class="h-64 flex items-center justify-center text-xs text-base-content/40">
                Cargando…
              </div>
            }
          >
            <McpSetupPanel
              tokens={activeTokens()}
              writeToClipboard={writeToClipboard}
              showToast={showToast}
              onCreateToken={props.onOpenTokens}
            />
          </Show>
        </div>

        <Show when={toast()}>
          {(t) => (
            <div class="px-5 pb-4">
              <div
                class={`rounded-[12px] px-3 py-2 text-[11px] font-semibold ${
                  t().type === 'ok'
                    ? 'bg-ios-green-500/10 text-ios-green-600'
                    : 'bg-ios-red-500/10 text-ios-red-600'
                }`}
              >
                {t().message}
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};

export default McpSetupModal;
