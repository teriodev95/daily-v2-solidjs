import { createSignal, createResource, onCleanup, onMount, Show, For, type Component, type JSX } from 'solid-js';
import { ChevronLeft, Lock, Eye, EyeOff, AlertCircle } from 'lucide-solid';
import { api, type SecretMeta } from '../../lib/api';

interface Props {
  // When `secret` is provided the editor edits it; otherwise it creates a new one.
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

const inputClass =
  'w-full px-3.5 h-11 rounded-xl bg-base-content/[0.04] border border-base-content/[0.07] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all';

const Field: Component<{ label: string; hint?: string; children: JSX.Element }> = (props) => (
  <div class="space-y-1.5">
    <label class="text-[11px] font-semibold text-base-content/55">{props.label}</label>
    {props.children}
    <Show when={props.hint}>
      <p class="text-[11px] leading-relaxed text-base-content/35">{props.hint}</p>
    </Show>
  </div>
);

const SectionHeader: Component<{ title: string; subtitle: string }> = (props) => (
  <div class="space-y-0.5">
    <h3 class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/35">{props.title}</h3>
    <p class="text-xs text-base-content/45">{props.subtitle}</p>
  </div>
);

const SecretEditor: Component<Props> = (props) => {
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
      // Defensive: drop the plaintext value from memory when the editor unmounts.
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
    <div class="fixed inset-0 z-[120] flex flex-col bg-base-100" role="dialog" aria-modal="true" aria-labelledby="secret-editor-title">
      {/* Top bar */}
      <header class="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-base-content/[0.06] bg-base-100/85 px-3 backdrop-blur-md sm:px-5">
        <div class="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Volver"
            class="-ml-1 flex h-9 items-center gap-1 rounded-[12px] pl-1 pr-2.5 text-sm font-medium text-base-content/55 transition-colors hover:bg-base-content/[0.05] hover:text-base-content/80"
          >
            <ChevronLeft size={20} strokeWidth={2.2} />
            <span class="hidden sm:inline">Secretos</span>
          </button>
          <div class="flex min-w-0 items-center gap-2 pl-1">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-ios-blue-500/10 text-ios-blue-500">
              <Lock size={14} />
            </div>
            <div class="min-w-0">
              <h2 id="secret-editor-title" class="truncate text-[15px] font-semibold leading-tight">
                {isEdit() ? 'Editar secreto' : 'Nuevo secreto'}
              </h2>
              <Show when={isEdit()}>
                <p class="truncate text-[11px] leading-tight text-base-content/40">{props.secret!.name}</p>
              </Show>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit()}
          class="inline-flex h-9 shrink-0 items-center rounded-[12px] bg-ios-blue-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-ios-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting() ? 'Guardando…' : isEdit() ? 'Guardar' : 'Crear'}
        </button>
      </header>

      {/* Content */}
      <div class="flex-1 overflow-y-auto [scrollbar-width:thin]">
        <div class="mx-auto w-full max-w-2xl space-y-9 px-4 py-7 pb-24 sm:px-6 sm:py-9">
          {/* Identidad */}
          <section class="space-y-4">
            <SectionHeader title="Identidad" subtitle="Cómo se reconoce este secreto en la app y por los agentes." />
            <Field label="Nombre">
              <input
                type="text"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value.slice(0, 80))}
                placeholder="p. ej. Cloudflare API Token"
                maxLength={80}
                autofocus={!isEdit()}
                class={inputClass}
              />
            </Field>
            <Field label="Clave" hint="Identificador que usará el agente o la integración.">
              <input
                type="text"
                value={key()}
                onInput={(e) => setKey(e.currentTarget.value.slice(0, 120))}
                placeholder="CLOUDFLARE_API_TOKEN"
                maxLength={120}
                spellcheck={false}
                autocapitalize="none"
                class={`${inputClass} font-mono`}
              />
            </Field>
          </section>

          {/* Valor */}
          <section class="space-y-4">
            <SectionHeader title="Valor" subtitle="Se cifra con AES-256-GCM. Nunca aparece en listas: solo al revelar." />
            <Field
              label="Valor del secreto"
              hint={isEdit() ? 'El valor actual no se muestra. Escribe uno nuevo solo si quieres reemplazarlo.' : undefined}
            >
              <div class="relative">
                <input
                  type={showValue() ? 'text' : 'password'}
                  value={value()}
                  onInput={(e) => setValue(e.currentTarget.value)}
                  placeholder={isEdit() ? 'Dejar vacío para no cambiar' : 'Pega el secreto aquí'}
                  autocomplete="new-password"
                  spellcheck={false}
                  autocapitalize="none"
                  class={`${inputClass} pr-11 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowValue((v) => !v)}
                  aria-label={showValue() ? 'Ocultar valor' : 'Mostrar valor'}
                  class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-base-content/35 transition-all hover:bg-base-content/5 hover:text-base-content/75"
                >
                  <Show when={showValue()} fallback={<Eye size={16} />}>
                    <EyeOff size={16} />
                  </Show>
                </button>
              </div>
            </Field>
          </section>

          {/* Contexto */}
          <section class="space-y-4">
            <SectionHeader title="Contexto" subtitle="Opcional. Ayuda a filtrar y a dar contexto a los agentes." />
            <Field label="Proyecto">
              <select
                value={projectId()}
                onChange={(e) => setProjectId(e.currentTarget.value)}
                class={inputClass}
              >
                <option value={NO_PROJECT}>Sin proyecto (equipo / global)</option>
                <For each={projects() ?? []}>
                  {(p) => <option value={p.id}>{p.name}</option>}
                </For>
              </select>
            </Field>

            <Field label="Entorno">
              <div class="flex flex-wrap gap-1.5">
                <For each={ENV_PRESETS}>
                  {(env) => {
                    const active = () => environment() === env;
                    return (
                      <button
                        type="button"
                        onClick={() => setEnvironment(active() ? '' : env)}
                        class={`h-9 rounded-full border px-4 text-xs font-medium transition-all ${
                          active()
                            ? 'border-ios-blue-500/30 bg-ios-blue-500/10 text-ios-blue-500'
                            : 'border-base-content/[0.07] bg-base-content/[0.03] text-base-content/50 hover:text-base-content/80'
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
                class={`${inputClass} mt-2 h-10`}
              />
            </Field>

            <Field label="Etiquetas">
              <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-base-content/[0.07] bg-base-content/[0.04] px-2 py-2 transition-all focus-within:ring-2 focus-within:ring-ios-blue-500/30">
                <For each={tags()}>
                  {(t) => (
                    <span class="inline-flex items-center gap-1 rounded-md bg-ios-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-ios-blue-500">
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTag(t)}
                        aria-label={`Quitar etiqueta ${t}`}
                        class="hover:text-ios-blue-600"
                      >
                        <span aria-hidden="true">×</span>
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
                  class="min-w-[120px] flex-1 bg-transparent py-0.5 text-sm focus:outline-none"
                />
              </div>
              <Show when={TAG_SUGGESTIONS.some((s) => !tags().includes(s))}>
                <div class="flex flex-wrap gap-1 pt-1.5">
                  <For each={TAG_SUGGESTIONS.filter((s) => !tags().includes(s))}>
                    {(s) => (
                      <button
                        type="button"
                        onClick={() => addTag(s)}
                        class="rounded-md bg-base-content/[0.04] px-2 py-0.5 text-[11px] font-medium text-base-content/40 transition-all hover:bg-base-content/[0.08] hover:text-base-content/70"
                      >
                        + {s}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </Field>
          </section>

          <Show when={error()}>
            <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-red-500">
              <AlertCircle size={15} class="mt-0.5 shrink-0" />
              <p class="text-xs">{error()}</p>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default SecretEditor;
