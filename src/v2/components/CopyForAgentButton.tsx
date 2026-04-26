import { createSignal, onCleanup, Show, type Component } from 'solid-js';
import { Share2, Link as LinkIcon, Clipboard, Check, AlertCircle, Loader2 } from 'lucide-solid';
import { api, type ShareTokenResponse } from '../lib/api';

export type ShareableEntityType = 'story' | 'wiki';

export interface ShareableEntity {
  type: ShareableEntityType;
  id: string;
  title: string;
}

interface Props {
  entity: ShareableEntity;
  /** Optional extra context for the prompt (e.g. "Espacio: Daily Check" for wiki) */
  contextLabel?: string;
}

type ToastKind = 'success' | 'error';
interface ToastState {
  kind: ToastKind;
  message: string;
}

const formatExpiration = (isoDate: string): string => {
  const d = new Date(isoDate);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
};

const copyToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for insecure contexts
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.top = '-9999px';
  ta.style.left = '-9999px';
  ta.setAttribute('readonly', '');
  document.body.appendChild(ta);
  ta.select();
  try {
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('execCommand copy returned false');
  } finally {
    document.body.removeChild(ta);
  }
};

const buildStoryPrompt = (storyTitle: string, shareUrl: string): string =>
  `Trabaja en esta Historia de Usuario: "${storyTitle}".

URL de contexto (incluye el share token):
${shareUrl}

Haz GET a esa URL. El endpoint devuelve un manifiesto JSON con enlaces a sub-recursos.

Antes de empezar:
1. Lee primero "agent_brief" del manifiesto para entender el contexto.
2. Luego revisa "/description" para los detalles y "/criteria" para los criterios de aceptación.
3. Usa los enlaces de "actions" solo si tu token lo permite (los scopes vienen declarados en el manifiesto).

Responde únicamente basándote en el contenido del manifiesto y sus sub-recursos.`;

const buildWikiPrompt = (articleTitle: string, shareUrl: string, contextLabel?: string): string => {
  const contextLine = contextLabel ? `\n${contextLabel}` : '';
  return `Artículo de wiki: "${articleTitle}".${contextLine}

URL: ${shareUrl}

El endpoint devuelve un manifiesto con el vecindario del grafo (neighbors), enlaces a sub-recursos (/content, /outline, /graph, /space_search, /space_tags, /space_index) y metadatos de auth. El token autoriza lectura del espacio completo, así que puedes navegar al artículo que necesites siguiendo los URLs en 'neighbors' y 'links'.`;
};

const buildPromptText = (entity: ShareableEntity, shareUrl: string, contextLabel?: string): string => {
  if (entity.type === 'wiki') return buildWikiPrompt(entity.title, shareUrl, contextLabel);
  return buildStoryPrompt(entity.title, shareUrl);
};

const buildSuccessToast = (
  entity: ShareableEntity,
  response: ShareTokenResponse,
  contextLabel?: string,
): string => {
  const dateLabel = formatExpiration(response.expires_at);
  const base =
    entity.type === 'wiki'
      ? `Enlace copiado. Da acceso al espacio "${contextLabel || entity.title}". Expira el ${dateLabel}.`
      : `Enlace copiado. Expira el ${dateLabel}.`;
  return response.previous_revoked
    ? `${base} El enlace anterior fue invalidado.`
    : base;
};

const CopyForAgentButton: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [toast, setToast] = createSignal<ToastState | null>(null);

  let containerRef: HTMLDivElement | undefined;
  let buttonRef: HTMLButtonElement | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let listenersAttached = false;

  const showToast = (kind: ToastKind, message: string) => {
    setToast({ kind, message });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(null), 3000);
  };

  const detachListeners = () => {
    if (!listenersAttached) return;
    document.removeEventListener('mousedown', handleClickOutside);
    document.removeEventListener('keydown', handleKeyDown, true);
    listenersAttached = false;
  };

  const attachListeners = () => {
    if (listenersAttached) return;
    document.addEventListener('mousedown', handleClickOutside);
    // Capture phase so we intercept Escape before the parent modal's handler
    document.addEventListener('keydown', handleKeyDown, true);
    listenersAttached = true;
  };

  const closeDropdown = (returnFocus = false) => {
    setOpen(false);
    detachListeners();
    if (returnFocus && buttonRef) buttonRef.focus();
  };

  // Click outside
  const handleClickOutside = (e: MouseEvent) => {
    if (!containerRef) return;
    if (!containerRef.contains(e.target as Node)) {
      closeDropdown();
    }
  };

  // Escape key (capture phase — stops the parent modal from also closing)
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open()) {
      e.stopPropagation();
      e.preventDefault();
      closeDropdown(true);
    }
  };

  const toggleDropdown = () => {
    if (open()) {
      closeDropdown();
    } else {
      setOpen(true);
      attachListeners();
    }
  };

  onCleanup(() => {
    clearTimeout(toastTimer);
    detachListeners();
  });

  const createShareToken = (): Promise<ShareTokenResponse> => {
    const { entity } = props;
    if (entity.type === 'wiki') return api.wiki.createShareToken(entity.id);
    return api.stories.createShareToken(entity.id);
  };

  const ariaLabel = () =>
    props.entity.type === 'wiki'
      ? 'Compartir artículo con agente'
      : 'Compartir historia con agente';

  const handleCopy = async (mode: 'url' | 'prompt') => {
    if (loading()) return;
    setLoading(true);
    // Close dropdown immediately so user sees the spinner on the trigger
    closeDropdown();
    try {
      const response = await createShareToken();
      const text =
        mode === 'url'
          ? response.share_url
          : buildPromptText(props.entity, response.share_url, props.contextLabel);
      await copyToClipboard(text);
      showToast('success', buildSuccessToast(props.entity, response, props.contextLabel));
    } catch (err) {
      console.error('[CopyForAgentButton] copy failed', err);
      showToast('error', 'No se pudo copiar el enlace. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="relative" ref={(el) => { containerRef = el; }}>
      <button
        type="button"
        ref={(el) => { buttonRef = el; }}
        onClick={toggleDropdown}
        disabled={loading()}
        aria-label={ariaLabel()}
        aria-haspopup="menu"
        aria-expanded={open()}
        title="Compartir con agente"
        class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-base-content/62 bg-base-content/[0.04] hover:bg-base-content/[0.08] hover:text-base-content transition-[background-color,color,opacity] disabled:opacity-50 disabled:cursor-wait"
      >
        <Show when={loading()} fallback={<Share2 size={17} strokeWidth={2.2} />}>
          <Loader2 size={17} class="animate-spin" />
        </Show>
      </button>

      {/* Dropdown */}
      <Show when={open()}>
        <div
          role="menu"
          aria-label="Opciones de compartir"
          class="absolute top-[calc(100%+6px)] right-0 z-30 bg-base-100 rounded-xl border border-base-content/[0.08] shadow-lg shadow-black/10 p-1.5 min-w-[220px] backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleCopy('url')}
            disabled={loading()}
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] font-medium text-base-content/75 hover:bg-base-content/[0.05] hover:text-base-content transition-all disabled:opacity-50"
          >
            <LinkIcon size={14} class="shrink-0 text-base-content/50" />
            <span>Copiar URL</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleCopy('prompt')}
            disabled={loading()}
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] font-medium text-base-content/75 hover:bg-base-content/[0.05] hover:text-base-content transition-all disabled:opacity-50"
          >
            <Clipboard size={14} class="shrink-0 text-base-content/50" />
            <span>Copiar como prompt</span>
          </button>
        </div>
      </Show>

      {/* Toast */}
      <Show when={toast()}>
        {(t) => (
          <div
            role="status"
            aria-live="polite"
            class="absolute top-[calc(100%+10px)] right-0 z-40 flex items-center gap-2 rounded-xl px-3.5 py-2 shadow-lg shadow-black/20 text-[12px] font-medium whitespace-nowrap max-w-[320px] animate-in fade-in slide-in-from-top-1 duration-200 bg-base-content text-base-100"
          >
            <Show
              when={t().kind === 'success'}
              fallback={<AlertCircle size={14} class="shrink-0 text-red-400" />}
            >
              <Check size={14} class="shrink-0 text-ios-green-500" strokeWidth={2.5} />
            </Show>
            <span class="whitespace-normal leading-snug">{t().message}</span>
          </div>
        )}
      </Show>
    </div>
  );
};

export default CopyForAgentButton;
