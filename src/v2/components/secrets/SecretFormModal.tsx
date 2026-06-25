import { createSignal, createResource, onCleanup, onMount, Show, For, type Component } from 'solid-js';
import { X, Lock, Eye, EyeOff, AlertCircle } from 'lucide-solid';
import { api, type SecretMeta } from '../../lib/api';

interface Props {
  // When `secret` is provided the modal edits it; otherwise it creates a new one.
  secret?: SecretMeta;
  onClose: () => void;
  onSaved: () => void;
}

const ENV_PRESETS = ['dev', 'staging', 'prod', 'local'];

const TAG_SUGGESTIONS = [
  'cloudflare', 'resend', 'smtp', 'api', 'database', 'worker', 'pages',
  'production', 'development', 'agent-readable', 'project-scoped', 'team-global',
];

const NO_PROJECT = '__none__';

const SecretFormModal: Component<Props> = (props) => {
  const isEdit = () => !!props.secret;

  const [projects] = createResource(() => api.projects.list());

  const [name, setName] = createSignal(props.secret?.name ?? '');
  const [key, setKey] = createSignal(props.secret?.key ?? '');
  const [value, setValue] = createSignal('');
  const [showValue, setShowValue] = createSignal(false);
  const [projectId, setProjectId] = createSignal<string>(props.secret?.project_id ?? NO_PROJECT);
  const [environment, setEnvironment] = createSignal<string>(props.secret?.environment ?? '');
  const [tags, setTags] = createSignal<string[]>(props.secret?.tags ?? []);
  const [tagDraft, setTagDraft] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t) return;
    if (!tags().includes(t)) setTags([...tags(), t]);
    setTagDraft('');
  };

  const removeTag = (t: string) => setTags(tags().filter((x) => x !== t));

  const onTagKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagDraft());
    } else if (e.key === 'Backspace' && tagDraft() === '' && tags().length > 0) {
      removeTag(tags()[tags().length - 1]);
    }
  };

  // On create, value is required; on edit an empty value means "don't change".
  const canSubmit = () =>
    name().trim().length > 0 &&
    key().trim().length > 0 &&
    (isEdit() || value().trim().length > 0) &&
    !submitting();

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
      // Defensive: drop the plaintext value from memory when the modal unmounts.
      setValue('');
    });
  });

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setSubmitting(true);
    setError('');
    const pid = projectId() === NO_PROJECT ? null : projectId();
    const env = environment().trim() === '' ? null : environment().trim();
    try {
      if (isEdit()) {
        const data: Record<string, unknown> = {
          name: name().trim(),
          key: key().trim(),
          project_id: pid,
          environment: env,
          tags: tags(),
        };
        // Only send value when the user actually typed a replacement.
        if (value().trim().length > 0) data.value = value();
        await api.secrets.update(props.secret!.id, data);
      } else {
        await api.secrets.create({
          name: name().trim(),
          key: key().trim(),
          value: value(),
          project_id: pid,
          environment: env,
          tags: tags(),
        });
      }
      setValue('');
      props.onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar el secreto');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting()) props.onClose();
      }}
    >
      <div class="bg-base-100 w-full sm:max-w-lg sm:rounded-[24px] rounded-t-[24px] shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div class="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-base-content/[0.06] bg-base-100/90 backdrop-blur-md">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-ios-blue-500/10 flex items-center justify-center text-ios-blue-500">
              <Lock size={15} />
            </div>
            <h2 id="secret-form-title" class="text-base font-semibold">
              {isEdit() ? 'Editar secreto' : 'Nuevo secreto'}
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

        <div class="px-5 py-5 space-y-4">
          {/* Name */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">
              Nombre
            </label>
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value.slice(0, 80))}
              placeholder="p. ej. Cloudflare API Token"
              maxLength={80}
              class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
            />
          </div>

          {/* Key */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">
              Clave
            </label>
            <input
              type="text"
              value={key()}
              onInput={(e) => setKey(e.currentTarget.value.slice(0, 120))}
              placeholder="CLOUDFLARE_API_TOKEN"
              maxLength={120}
              spellcheck={false}
              autocapitalize="none"
              class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
            />
            <p class="text-[10px] text-base-content/30">
              Identificador que usará el agente o la integración.
            </p>
          </div>

          {/* Value */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">
              Valor
            </label>
            <div class="relative">
              <input
                type={showValue() ? 'text' : 'password'}
                value={value()}
                onInput={(e) => setValue(e.currentTarget.value)}
                placeholder={isEdit() ? 'Dejar vacío para no cambiar' : 'Pega el secreto aquí'}
                autocomplete="new-password"
                spellcheck={false}
                autocapitalize="none"
                class="w-full px-3 py-2.5 pr-10 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                aria-label={showValue() ? 'Ocultar valor' : 'Mostrar valor'}
                class="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-base-content/30 hover:text-base-content/70 hover:bg-base-content/5 transition-all"
              >
                <Show when={showValue()} fallback={<Eye size={15} />}>
                  <EyeOff size={15} />
                </Show>
              </button>
            </div>
            <Show when={isEdit()}>
              <p class="text-[10px] text-base-content/30">
                El valor actual no se muestra. Escribe uno nuevo solo si quieres reemplazarlo.
              </p>
            </Show>
          </div>

          {/* Project */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">
              Proyecto
            </label>
            <select
              value={projectId()}
              onChange={(e) => setProjectId(e.currentTarget.value)}
              class="w-full px-3 py-2.5 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
            >
              <option value={NO_PROJECT}>Sin proyecto (equipo/global)</option>
              <For each={projects() ?? []}>
                {(p) => <option value={p.id}>{p.name}</option>}
              </For>
            </select>
          </div>

          {/* Environment */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">
              Entorno
            </label>
            <div class="flex flex-wrap gap-1.5">
              <For each={ENV_PRESETS}>
                {(env) => {
                  const active = () => environment() === env;
                  return (
                    <button
                      type="button"
                      onClick={() => setEnvironment(active() ? '' : env)}
                      class={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        active()
                          ? 'bg-ios-blue-500/10 text-ios-blue-500 border-ios-blue-500/30'
                          : 'bg-base-content/[0.03] text-base-content/50 border-base-content/[0.06] hover:text-base-content/80'
                      }`}
                    >
                      {env}
                    </button>
                  );
                }}
              </For>
            </div>
            <input
              type="text"
              value={environment()}
              onInput={(e) => setEnvironment(e.currentTarget.value.slice(0, 40))}
              placeholder="o escribe uno libre (opcional)"
              maxLength={40}
              spellcheck={false}
              autocapitalize="none"
              class="w-full px-3 py-2 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all"
            />
          </div>

          {/* Tags */}
          <div class="space-y-1.5">
            <label class="text-[10px] font-semibold uppercase text-base-content/30 tracking-wider">
              Etiquetas
            </label>
            <div class="flex flex-wrap items-center gap-1.5 px-2 py-2 rounded-xl bg-base-content/[0.04] border border-base-content/[0.06] focus-within:ring-2 focus-within:ring-ios-blue-500/30 transition-all">
              <For each={tags()}>
                {(t) => (
                  <span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium bg-ios-blue-500/10 text-ios-blue-500">
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      aria-label={`Quitar etiqueta ${t}`}
                      class="hover:text-ios-blue-600"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}
              </For>
              <input
                type="text"
                value={tagDraft()}
                onInput={(e) => setTagDraft(e.currentTarget.value)}
                onKeyDown={onTagKey}
                onBlur={() => addTag(tagDraft())}
                placeholder={tags().length === 0 ? 'Escribe y pulsa Enter' : ''}
                spellcheck={false}
                autocapitalize="none"
                class="flex-1 min-w-[120px] bg-transparent text-sm focus:outline-none py-0.5"
              />
            </div>
            <Show when={TAG_SUGGESTIONS.some((s) => !tags().includes(s))}>
              <div class="flex flex-wrap gap-1 pt-1">
                <For each={TAG_SUGGESTIONS.filter((s) => !tags().includes(s))}>
                  {(s) => (
                    <button
                      type="button"
                      onClick={() => addTag(s)}
                      class="text-[10px] px-2 py-0.5 rounded-md font-medium bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08] hover:text-base-content/70 transition-all"
                    >
                      + {s}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <Show when={error()}>
            <div class="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-red-500">
              <AlertCircle size={14} class="mt-0.5 shrink-0" />
              <p class="text-xs">{error()}</p>
            </div>
          </Show>
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
            {submitting() ? 'Guardando...' : isEdit() ? 'Guardar cambios' : 'Crear secreto'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecretFormModal;
