import { createEffect, createSignal, createResource, createMemo, onCleanup, For, Show, type Component } from 'solid-js';
import { Lock, Settings, Plus, Copy, Check, Trash2, AlertCircle, X, Eye, EyeOff, Pencil } from 'lucide-solid';
import TopNavigation from '../components/TopNavigation';
import SecretFormModal from '../components/secrets/SecretFormModal';
import { api, type SecretMeta } from '../lib/api';
import { useOnceReady } from '../lib/onceReady';

const formatRelative = (dateStr: string | null): string => {
  if (!dateStr) return 'nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace segundos';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `hace ${weeks} sem`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? '' : 'es'}`;
  return `hace ${Math.floor(days / 365)} año${Math.floor(days / 365) === 1 ? '' : 's'}`;
};

// Friendly labels for the common audit event types; unknown types pass through.
const EVENT_LABELS: Record<string, string> = {
  'secret.created': 'Creado',
  'secret.updated': 'Actualizado',
  'secret.revealed': 'Revelado',
  'secret.deleted': 'Eliminado',
  'secret.associated_project_changed': 'Proyecto cambiado',
  'secret.tags_changed': 'Etiquetas cambiadas',
};
const eventLabel = (type: string): string => EVENT_LABELS[type] ?? type;

const SecretsPage: Component = () => {
  const [secrets, { refetch, mutate }] = createResource(() => api.secrets.list());
  const [projects] = createResource(() => api.projects.list());
  const ready = useOnceReady(secrets);

  const [showCreate, setShowCreate] = createSignal(false);
  const [editing, setEditing] = createSignal<SecretMeta | null>(null);
  const [confirmDelete, setConfirmDelete] = createSignal<SecretMeta | null>(null);
  const [deleting, setDeleting] = createSignal(false);
  const [toast, setToast] = createSignal<{ type: 'ok' | 'error'; message: string } | null>(null);

  // Revealed secret state — the plaintext `value` lives here ONLY while the
  // reveal modal is open. Closing it (or replacing the target) clears the
  // signal so the secret never lingers in memory longer than necessary.
  const [revealTarget, setRevealTarget] = createSignal<SecretMeta | null>(null);
  const [revealValue, setRevealValue] = createSignal<string | null>(null);
  const [revealLoading, setRevealLoading] = createSignal(false);
  const [revealShown, setRevealShown] = createSignal(false);
  const [revealCopied, setRevealCopied] = createSignal(false);

  const projectName = createMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects() ?? []) map.set(p.id, p.name);
    return map;
  });

  const activeSecrets = () => (secrets() ?? []).filter((s) => !s.revoked_at);

  const showToast = (type: 'ok' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2600);
  };

  const writeToClipboard = async (text: string): Promise<void> => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback for insecure contexts or old browsers
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

  // Fully wipe any revealed plaintext from component state.
  const clearReveal = () => {
    setRevealTarget(null);
    setRevealValue(null);
    setRevealShown(false);
    setRevealCopied(false);
    setRevealLoading(false);
  };

  const openReveal = async (secret: SecretMeta) => {
    if (revealLoading()) return;
    setRevealTarget(secret);
    setRevealValue(null);
    setRevealShown(true);
    setRevealCopied(false);
    setRevealLoading(true);
    try {
      const res = await api.secrets.reveal(secret.id);
      // Guard against a stale response if the user already closed/switched.
      if (revealTarget()?.id === secret.id) setRevealValue(res.value);
      refetch(); // reveal is audited; refresh last_event
    } catch (e: any) {
      showToast('error', e?.message ?? 'No se pudo revelar el secreto');
      clearReveal();
    } finally {
      setRevealLoading(false);
    }
  };

  const handleRevealCopy = async () => {
    const v = revealValue();
    if (!v) return;
    try {
      await writeToClipboard(v);
      setRevealCopied(true);
      showToast('ok', 'Valor copiado');
      setTimeout(() => setRevealCopied(false), 2000);
    } catch (e: any) {
      const msg = e?.message === 'clipboard-unavailable'
        ? 'Tu navegador no permite copiar. Usa HTTPS o copia manualmente.'
        : e?.message ?? 'No se pudo copiar el valor';
      showToast('error', msg);
    }
  };

  const handleConfirmDelete = async () => {
    const s = confirmDelete();
    if (!s || deleting()) return;
    setDeleting(true);
    try {
      await api.secrets.remove(s.id);
      mutate((prev) => (prev ?? []).filter((x) => x.id !== s.id));
      setConfirmDelete(null);
      showToast('ok', 'Secreto eliminado');
      refetch();
    } catch (e: any) {
      showToast('error', e?.message ?? 'No se pudo eliminar el secreto');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaved = () => {
    setShowCreate(false);
    setEditing(null);
    showToast('ok', 'Secreto guardado');
    refetch();
  };

  // Close reveal / delete-confirm on Escape, and always wipe reveal on cleanup.
  createEffect(() => {
    if (!revealTarget() && !confirmDelete()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (revealTarget()) {
        e.preventDefault();
        clearReveal();
      } else if (confirmDelete() && !deleting()) {
        e.preventDefault();
        setConfirmDelete(null);
      }
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  // Safety net: if the page unmounts, never leave plaintext behind.
  onCleanup(() => clearReveal());

  return (
    <>
      <TopNavigation
        breadcrumbs={[
          { label: 'Ajustes', icon: <Settings size={14} /> },
          { label: 'Secretos', icon: <Lock size={14} /> },
        ]}
      />

      <div class="space-y-5">
        {/* Page header */}
        <div class="flex items-start justify-between gap-4">
          <div>
            <h1 class="text-lg font-bold">Secretos</h1>
            <p class="text-xs text-base-content/50 mt-1 max-w-xl">
              Vault interno del equipo. Guarda claves, tokens y credenciales con
              metadata por proyecto y entorno; revélalas solo cuando las necesites.
            </p>
          </div>
          <Show when={activeSecrets().length > 0}>
            <button
              onClick={() => setShowCreate(true)}
              class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-ios-blue-500 text-white text-xs font-semibold hover:bg-ios-blue-600 transition-colors shrink-0"
            >
              <Plus size={14} />
              Nuevo secreto
            </button>
          </Show>
        </div>

        {/* Content */}
        <Show when={ready()} fallback={<SecretsSkeleton />}>
          <Show
            when={activeSecrets().length > 0}
            fallback={<EmptyState onCreate={() => setShowCreate(true)} />}
          >
            <div class="bg-base-100 border border-base-content/[0.08] rounded-xl shadow-sm overflow-hidden">
              {/* Table header (desktop) */}
              <div class="hidden md:grid grid-cols-[1.4fr_1.3fr_1fr_0.9fr_auto] gap-3 px-5 py-2.5 bg-base-content/[0.03] border-b border-base-content/[0.06]">
                <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider">Nombre</span>
                <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider">Clave</span>
                <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider">Proyecto</span>
                <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider">Último evento</span>
                <span class="text-[10px] font-semibold uppercase text-base-content/40 tracking-wider text-right">Acciones</span>
              </div>

              <div class="divide-y divide-base-content/[0.05]">
                <For each={activeSecrets()}>
                  {(secret) => {
                    const proj = () => (secret.project_id ? projectName().get(secret.project_id) ?? 'Proyecto' : null);
                    return (
                      <div class="md:grid md:grid-cols-[1.4fr_1.3fr_1fr_0.9fr_auto] md:gap-3 md:items-center px-5 py-3.5 hover:bg-base-content/[0.02] transition-colors">
                        {/* Name + environment + tags */}
                        <div class="min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-semibold truncate">{secret.name}</span>
                            <Show when={secret.environment}>
                              <span class="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-ios-blue-500/10 text-ios-blue-500">
                                {secret.environment}
                              </span>
                            </Show>
                          </div>
                          <Show when={secret.tags.length > 0}>
                            <div class="flex flex-wrap gap-1 mt-1.5">
                              <For each={secret.tags.slice(0, 4)}>
                                {(t) => (
                                  <span class="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-base-content/[0.06] text-base-content/50">
                                    {t}
                                  </span>
                                )}
                              </For>
                              <Show when={secret.tags.length > 4}>
                                <span class="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-base-content/[0.06] text-base-content/40">
                                  +{secret.tags.length - 4}
                                </span>
                              </Show>
                            </div>
                          </Show>
                        </div>

                        {/* Key */}
                        <div class="min-w-0 mt-2 md:mt-0">
                          <code class="font-mono text-[11px] px-2 py-1 rounded-md bg-base-content/[0.05] text-base-content/70 truncate inline-block max-w-full align-middle">
                            {secret.key}
                          </code>
                        </div>

                        {/* Project */}
                        <div class="text-[11px] mt-2 md:mt-0">
                          <span class="md:hidden text-base-content/30 mr-1">Proyecto:</span>
                          <Show
                            when={proj()}
                            fallback={<span class="text-base-content/40">Global/Equipo</span>}
                          >
                            <span class="text-base-content/70">{proj()}</span>
                          </Show>
                        </div>

                        {/* Last event */}
                        <div class="text-[11px] text-base-content/50 mt-2 md:mt-0">
                          <span class="md:hidden text-base-content/30 mr-1">Último evento:</span>
                          <Show when={secret.last_event} fallback={<span class="text-base-content/30">—</span>}>
                            {(ev) => (
                              <span>
                                {eventLabel(ev().event_type)}
                                <span class="text-base-content/30"> · {formatRelative(ev().created_at)}</span>
                              </span>
                            )}
                          </Show>
                        </div>

                        {/* Actions */}
                        <div class="flex justify-end gap-0.5 mt-2 md:mt-0">
                          <button
                            onClick={() => openReveal(secret)}
                            class="p-1.5 rounded-lg text-base-content/30 hover:text-ios-blue-500 hover:bg-ios-blue-500/10 transition-all"
                            title="Revelar valor"
                            aria-label={`Revelar valor de ${secret.name}`}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => setEditing(secret)}
                            class="p-1.5 rounded-lg text-base-content/30 hover:text-base-content/70 hover:bg-base-content/5 transition-all"
                            title="Editar secreto"
                            aria-label={`Editar secreto ${secret.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(secret)}
                            class="p-1.5 rounded-lg text-base-content/30 hover:text-red-500 hover:bg-red-500/10 transition-all"
                            title="Eliminar secreto"
                            aria-label={`Eliminar secreto ${secret.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </div>

      {/* Create / Edit modal */}
      <Show when={showCreate()}>
        <SecretFormModal onClose={() => setShowCreate(false)} onSaved={handleSaved} />
      </Show>
      <Show when={editing()}>
        {(sec) => (
          <SecretFormModal secret={sec()} onClose={() => setEditing(null)} onSaved={handleSaved} />
        )}
      </Show>

      {/* Reveal modal */}
      <Show when={revealTarget()}>
        {(sec) => (
          <div
            class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reveal-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) clearReveal();
            }}
          >
            <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div class="flex items-start justify-between px-5 py-4 border-b border-base-content/[0.06]">
                <div class="flex items-start gap-3 min-w-0">
                  <div class="w-9 h-9 rounded-xl bg-ios-blue-500/10 flex items-center justify-center text-ios-blue-500 shrink-0">
                    <Lock size={18} />
                  </div>
                  <div class="min-w-0">
                    <h2 id="reveal-title" class="text-base font-semibold truncate">{sec().name}</h2>
                    <p class="text-xs text-base-content/40 mt-0.5 font-mono truncate">{sec().key}</p>
                  </div>
                </div>
                <button
                  onClick={clearReveal}
                  aria-label="Cerrar"
                  class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              <div class="px-5 py-4 space-y-3">
                <div class="relative">
                  <input
                    type={revealShown() ? 'text' : 'password'}
                    readonly
                    value={revealValue() ?? ''}
                    onClick={(e) => revealShown() && e.currentTarget.select()}
                    placeholder={revealLoading() ? 'Revelando…' : ''}
                    class="w-full px-3 py-3 pr-20 rounded-xl bg-base-content/[0.04] border border-base-content/[0.08] font-mono text-xs text-base-content/90 focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30"
                  />
                  <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setRevealShown((v) => !v)}
                      disabled={revealLoading() || !revealValue()}
                      aria-label={revealShown() ? 'Ocultar valor' : 'Mostrar valor'}
                      class="p-1.5 rounded-lg text-base-content/40 hover:text-base-content/80 hover:bg-base-content/5 transition-all disabled:opacity-40"
                    >
                      <Show when={revealShown()} fallback={<Eye size={15} />}>
                        <EyeOff size={15} />
                      </Show>
                    </button>
                    <button
                      type="button"
                      onClick={handleRevealCopy}
                      disabled={revealLoading() || !revealValue()}
                      aria-label="Copiar valor"
                      class={`p-1.5 rounded-lg transition-all disabled:opacity-40 ${
                        revealCopied()
                          ? 'bg-ios-green-500/15 text-ios-green-500'
                          : 'text-base-content/40 hover:text-base-content/80 hover:bg-base-content/5'
                      }`}
                    >
                      <Show when={revealCopied()} fallback={<Copy size={15} />}>
                        <Check size={15} />
                      </Show>
                    </button>
                  </div>
                </div>
                <div class="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/20 text-amber-600 dark:text-amber-400">
                  <AlertCircle size={14} class="mt-0.5 shrink-0" />
                  <p class="text-[11px] leading-relaxed">
                    El valor se borra de la pantalla al cerrar. Esta revelación queda registrada en la auditoría.
                  </p>
                </div>
              </div>

              <div class="px-5 py-3.5 border-t border-base-content/[0.06] flex justify-end">
                <button
                  onClick={clearReveal}
                  class="px-4 py-2 rounded-xl bg-base-content text-base-100 text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* Delete confirm */}
      <Show when={confirmDelete()}>
        {(sec) => (
          <div
            class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(e) => {
              if (e.target === e.currentTarget && !deleting()) setConfirmDelete(null);
            }}
          >
            <div class="bg-base-100 w-full sm:max-w-md sm:rounded-[24px] rounded-t-[24px] shadow-2xl">
              <div class="flex items-start justify-between px-5 py-4 border-b border-base-content/[0.06]">
                <div class="flex items-start gap-3">
                  <div class="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h2 id="delete-title" class="text-base font-semibold">Eliminar secreto</h2>
                    <p class="text-xs text-base-content/40 mt-0.5">{sec().name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmDelete(null)}
                  aria-label="Cerrar"
                  class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div class="px-5 py-4">
                <p class="text-sm text-base-content/70 leading-relaxed">
                  El secreto se marcará como eliminado y dejará de estar disponible
                  para agentes e integraciones. Esta acción es inmediata.
                </p>
              </div>
              <div class="px-5 py-3.5 border-t border-base-content/[0.06] flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  class="px-4 py-2 rounded-xl text-sm font-medium text-base-content/60 hover:bg-base-content/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting()}
                  class="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-40"
                >
                  {deleting() ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* Toast */}
      <Show when={toast()}>
        {(t) => (
          <div class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
            <div
              class={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-md text-sm font-medium ${
                t().type === 'ok'
                  ? 'bg-base-content/90 text-base-100'
                  : 'bg-red-500/90 text-white'
              }`}
            >
              <Show when={t().type === 'ok'} fallback={<AlertCircle size={14} />}>
                <Check size={14} />
              </Show>
              {t().message}
            </div>
          </div>
        )}
      </Show>
    </>
  );
};

const EmptyState: Component<{ onCreate: () => void }> = (props) => (
  <div class="bg-base-100 border border-dashed border-base-content/[0.1] rounded-2xl px-8 py-12 text-center">
    <div class="mx-auto w-12 h-12 rounded-2xl bg-ios-blue-500/10 flex items-center justify-center text-ios-blue-500 mb-3">
      <Lock size={20} />
    </div>
    <h3 class="text-sm font-semibold">Aún no hay secretos</h3>
    <p class="text-xs text-base-content/50 mt-1 max-w-sm mx-auto">
      Guarda tu primera clave o credencial para compartirla de forma controlada
      con el equipo y los agentes.
    </p>
    <button
      onClick={props.onCreate}
      class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ios-blue-500 text-white text-xs font-semibold hover:bg-ios-blue-600 transition-colors"
    >
      <Plus size={14} />
      Crear primer secreto
    </button>
  </div>
);

const SecretsSkeleton: Component = () => (
  <div class="bg-base-100 border border-base-content/[0.08] rounded-xl shadow-sm overflow-hidden">
    <div class="divide-y divide-base-content/[0.05]">
      <For each={[0, 1, 2]}>
        {() => (
          <div class="px-5 py-3.5 flex items-center gap-3">
            <div class="flex-1 space-y-2">
              <div class="h-3.5 w-40 rounded bg-base-content/[0.08] animate-pulse" />
              <div class="h-2.5 w-64 rounded bg-base-content/[0.05] animate-pulse" />
            </div>
            <div class="h-3 w-20 rounded bg-base-content/[0.05] animate-pulse" />
            <div class="h-6 w-6 rounded bg-base-content/[0.05] animate-pulse" />
          </div>
        )}
      </For>
    </div>
  </div>
);

export default SecretsPage;
