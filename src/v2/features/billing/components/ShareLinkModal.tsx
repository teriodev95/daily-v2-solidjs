import { createSignal, createResource, Show, type Component } from 'solid-js';
import { X, Loader2, Link2, Copy, Check, RefreshCw, Trash2, AlertCircle } from 'lucide-solid';
import { billingApi } from '../lib/api';
import type { Client, ShareToken } from '../types';

interface Props {
  client: Client;
  onClose: () => void;
}

// Build the absolute portal URL from a relative url_path returned by the backend.
const absoluteUrl = (urlPath: string): string => {
  if (/^https?:\/\//i.test(urlPath)) return urlPath;
  const path = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  return `${window.location.origin}${path}`;
};

const writeToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const el = document.createElement('textarea');
  el.value = text; el.setAttribute('readonly', ''); el.style.position = 'fixed'; el.style.opacity = '0';
  document.body.appendChild(el); el.select();
  const ok = document.execCommand('copy'); document.body.removeChild(el);
  if (!ok) throw new Error('clipboard-unavailable');
};

const ShareLinkModal: Component<Props> = (props) => {
  // Existing token metadata (no raw token). null = no link yet.
  const [meta, { refetch }] = createResource(() => billingApi.shareToken.get(props.client.id));
  // Freshly created token (only time we get the raw token / full url).
  const [created, setCreated] = createSignal<ShareToken | null>(null);
  const [working, setWorking] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [error, setError] = createSignal('');

  const hasLink = () => !!created() || !!meta();

  // Full URL only available right after creation. For an existing token we only
  // know the path (no secret), so we can rebuild the URL but the secret is the
  // one shown at creation — backend returns url_path with the token embedded.
  const fullUrl = () => {
    const c = created();
    if (c) return absoluteUrl(c.url_path);
    const m = meta();
    return m ? absoluteUrl(m.url_path) : '';
  };

  const handleCreate = async () => {
    if (working()) return;
    setWorking(true); setError('');
    try {
      const token = await billingApi.shareToken.create(props.client.id);
      setCreated(token);
      void refetch();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo generar el enlace');
    } finally {
      setWorking(false);
    }
  };

  const handleRevoke = async () => {
    if (working()) return;
    setWorking(true); setError('');
    try {
      await billingApi.shareToken.revoke(props.client.id);
      setCreated(null);
      void refetch();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo revocar el enlace');
    } finally {
      setWorking(false);
    }
  };

  const handleCopy = async () => {
    try {
      await writeToClipboard(fullUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Tu navegador no permite copiar. Copia manualmente.');
    }
  };

  return (
    <div
      class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !working()) props.onClose(); }}
    >
      <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl">
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06]">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-ios-blue-500/10 text-ios-blue-500">
              <Link2 size={18} />
            </div>
            <div>
              <h2 class="text-base font-semibold">Enlace público</h2>
              <p class="text-xs text-base-content/40">{props.client.name}</p>
            </div>
          </div>
          <button onClick={props.onClose} aria-label="Cerrar" class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          <p class="text-xs text-base-content/50 leading-relaxed">
            Comparte este enlace de solo lectura para que el cliente vea su estado de cuenta,
            sus facturas y descargue PDF/XML. No requiere iniciar sesión.
          </p>

          <Show when={meta.loading && !created()}>
            <div class="flex items-center gap-2 text-xs text-base-content/40 py-3">
              <Loader2 size={14} class="animate-spin" /> Cargando…
            </div>
          </Show>

          <Show when={!meta.loading || created()}>
            <Show
              when={hasLink()}
              fallback={
                <button
                  onClick={handleCreate}
                  disabled={working()}
                  class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ios-blue-500 text-white text-sm font-semibold hover:bg-ios-blue-600 disabled:opacity-40 transition-colors"
                >
                  <Show when={working()} fallback={<Link2 size={15} />}><Loader2 size={15} class="animate-spin" /></Show>
                  Generar enlace
                </button>
              }
            >
              <div class="space-y-3">
                <div class="flex items-center gap-2 rounded-xl border border-base-content/[0.08] bg-base-content/[0.03] px-3 py-2">
                  <code class="flex-1 truncate font-mono text-[11px] text-base-content/70">{fullUrl()}</code>
                  <button
                    onClick={handleCopy}
                    class={`shrink-0 p-1.5 rounded-lg transition-all ${copied() ? 'bg-ios-green-500/15 text-ios-green-500' : 'text-base-content/40 hover:text-base-content/70 hover:bg-base-content/5'}`}
                    title="Copiar enlace"
                    aria-label={copied() ? 'Enlace copiado' : 'Copiar enlace'}
                  >
                    <Show when={copied()} fallback={<Copy size={14} />}><Check size={14} /></Show>
                  </button>
                </div>

                <Show when={created()}>
                  <p class="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertCircle size={13} class="mt-px shrink-0" />
                    Copia el enlace ahora: por seguridad no se mostrará completo de nuevo.
                  </p>
                </Show>

                <div class="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={working()}
                    class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-base-content/[0.05] text-xs font-medium text-base-content/60 hover:bg-base-content/[0.09] disabled:opacity-40 transition-colors"
                    title="Regenerar (revoca el anterior)"
                  >
                    <RefreshCw size={13} /> Regenerar
                  </button>
                  <button
                    onClick={handleRevoke}
                    disabled={working()}
                    class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-xs font-medium text-red-500 hover:bg-red-500/15 disabled:opacity-40 transition-colors"
                  >
                    <Trash2 size={13} /> Revocar
                  </button>
                </div>
              </div>
            </Show>
          </Show>

          <Show when={error()}>
            <div class="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error()}</div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default ShareLinkModal;
