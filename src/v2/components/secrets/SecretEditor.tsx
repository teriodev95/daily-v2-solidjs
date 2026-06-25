import { createSignal, createResource, createMemo, onCleanup, onMount, Show, For, type Component, type JSX } from 'solid-js';
import { X, Lock, Eye, EyeOff, AlertCircle, ChevronDown, Check, Globe } from 'lucide-solid';
import { api, type SecretMeta } from '../../lib/api';

interface Props {
  // When `secret` is provided the editor edits it; otherwise it creates a new one.
  secret?: SecretMeta;
  onClose: () => void;
  onSaved: () => void;
}

type ProjectLite = { id: string; name: string; color: string; prefix: string };

const ENV_PRESETS = ['dev', 'staging', 'prod', 'local'];

const TAG_SUGGESTIONS = [
  'cloudflare', 'resend', 'smtp', 'api', 'database', 'worker', 'pages',
  'production', 'development', 'agent-readable', 'project-scoped', 'team-global',
];

const NO_PROJECT = '__none__';

const fieldClass =
  'w-full px-3 h-10 rounded-xl bg-base-content/[0.04] border border-base-content/[0.07] text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40 transition-all';

const Field: Component<{ label: string; hint?: string; children: JSX.Element }> = (props) => (
  <div class="space-y-1">
    <label class="block text-[11px] font-semibold text-base-content/55">{props.label}</label>
    {props.children}
    <Show when={props.hint}>
      <p class="text-[10.5px] leading-snug text-base-content/35">{props.hint}</p>
    </Show>
  </div>
);

const ProjectSwatch: Component<{ project: ProjectLite }> = (props) => (
  <span
    class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[8.5px] font-bold uppercase text-white"
    style={{ background: props.project.color }}
  >
    {props.project.prefix.slice(0, 2)}
  </span>
);

// Native project picker that carries the project's own identity (color + prefix)
// instead of a generic <select>.
const ProjectSelect: Component<{
  projects: ProjectLite[];
  value: string;
  onChange: (v: string) => void;
}> = (props) => {
  const [open, setOpen] = createSignal(false);
  let ref: HTMLDivElement | undefined;
  const selected = () => props.projects.find((p) => p.id === props.value);

  onMount(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref && !ref.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    onCleanup(() => document.removeEventListener('mousedown', onDoc));
  });

  return (
    <div class="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open()}
        class={`${fieldClass} flex items-center justify-between gap-2 text-left`}
      >
        <span class="flex min-w-0 items-center gap-2">
          <Show
            when={selected()}
            fallback={
              <>
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-base-content/[0.08] text-base-content/45">
                  <Globe size={12} />
                </span>
                <span class="truncate text-base-content/70">Equipo / Global</span>
              </>
            }
          >
            <ProjectSwatch project={selected()!} />
            <span class="truncate">{selected()!.name}</span>
          </Show>
        </span>
        <ChevronDown size={16} class={`shrink-0 text-base-content/35 transition-transform ${open() ? 'rotate-180' : ''}`} />
      </button>
      <Show when={open()}>
        <div
          role="listbox"
          class="absolute left-0 right-0 z-30 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-base-content/[0.08] bg-base-100 p-1 shadow-xl"
        >
          <button
            type="button"
            onClick={() => { props.onChange(NO_PROJECT); setOpen(false); }}
            class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-base-content/[0.04]"
          >
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-base-content/[0.08] text-base-content/45">
              <Globe size={12} />
            </span>
            <span class="flex-1 truncate text-base-content/80">Equipo / Global</span>
            <Show when={props.value === NO_PROJECT}><Check size={15} class="shrink-0 text-ios-blue-500" /></Show>
          </button>
          <For each={props.projects}>
            {(p) => (
              <button
                type="button"
                onClick={() => { props.onChange(p.id); setOpen(false); }}
                class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-base-content/[0.04]"
              >
                <ProjectSwatch project={p} />
                <span class="flex-1 truncate">{p.name}</span>
                <Show when={props.value === p.id}><Check size={15} class="shrink-0 text-ios-blue-500" /></Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

const SecretEditor: Component<Props> = (props) => {
  const isEdit = () => !!props.secret;

  const [projectsRes] = createResource(() => api.projects.list());
  const projects = createMemo(() => (projectsRes() ?? []) as unknown as ProjectLite[]);

  const [name, setName] = createSignal(props.secret?.name ?? '');
  const [key, setKey] = createSignal(props.secret?.key ?? '');
  const [value, setValue] = createSignal('');
  const [showValue, setShowValue] = createSignal(true);
  const [projectId, setProjectId] = createSignal<string>(props.secret?.project_id ?? NO_PROJECT);
  const [environments, setEnvironments] = createSignal<string[]>(props.secret?.environments ?? []);
  const [tags, setTags] = createSignal<string[]>(props.secret?.tags ?? []);
  const [tagDraft, setTagDraft] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  const toggleEnv = (e: string) =>
    setEnvironments((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  const allEnvs = () => ENV_PRESETS.every((e) => environments().includes(e));
  const toggleAllEnvs = () => setEnvironments(allEnvs() ? [] : [...ENV_PRESETS]);

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

  // On create the value is required; on edit an empty value means "don't change".
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
      setValue(''); // never leave plaintext behind
    });
  });

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setSubmitting(true);
    setError('');
    const pid = projectId() === NO_PROJECT ? null : projectId();
    try {
      if (isEdit()) {
        const data: Record<string, unknown> = {
          name: name().trim(),
          key: key().trim(),
          project_id: pid,
          environments: environments(),
          tags: tags(),
        };
        if (value().trim().length > 0) data.value = value();
        await api.secrets.update(props.secret!.id, data);
      } else {
        await api.secrets.create({
          name: name().trim(),
          key: key().trim(),
          value: value(),
          project_id: pid,
          environments: environments(),
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
      class="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-editor-title"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting()) props.onClose(); }}
    >
      <div class="w-full rounded-t-[24px] bg-base-100 shadow-2xl sm:max-w-2xl sm:rounded-[22px]">
        {/* Header */}
        <div class="flex items-center justify-between gap-3 border-b border-base-content/[0.06] px-5 py-3.5">
          <div class="flex min-w-0 items-center gap-2.5">
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ios-blue-500/10 text-ios-blue-500">
              <Lock size={15} />
            </div>
            <h2 id="secret-editor-title" class="truncate text-[15px] font-semibold">
              {isEdit() ? 'Editar secreto' : 'Nuevo secreto'}
            </h2>
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

        {/* Body */}
        <div class="space-y-3.5 px-5 py-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <input
                type="text"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value.slice(0, 80))}
                placeholder="p. ej. Gitea API Token"
                maxLength={80}
                autofocus={!isEdit()}
                class={fieldClass}
              />
            </Field>
            <Field label="Clave">
              <input
                type="text"
                value={key()}
                onInput={(e) => setKey(e.currentTarget.value.slice(0, 120))}
                placeholder="GITEA_API_TOKEN"
                maxLength={120}
                spellcheck={false}
                autocapitalize="none"
                class={`${fieldClass} font-mono`}
              />
            </Field>
          </div>

          <Field label="Valor" hint="Se cifra (AES-256-GCM). Puede ser una sola línea o una nota con instrucciones.">
            <div class="relative">
              <textarea
                value={value()}
                onInput={(e) => setValue(e.currentTarget.value)}
                placeholder={isEdit() ? 'Dejar vacío para no cambiar' : 'Pega el token, o una nota con instrucciones…'}
                rows={3}
                spellcheck={false}
                autocapitalize="none"
                style={showValue() ? undefined : 'text-security: disc; -webkit-text-security: disc;'}
                class="w-full resize-y rounded-xl border border-base-content/[0.07] bg-base-content/[0.04] px-3 py-2.5 pr-10 font-mono text-[13px] leading-relaxed focus:border-ios-blue-500/40 focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30"
              />
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                aria-label={showValue() ? 'Ocultar valor' : 'Mostrar valor'}
                class="absolute right-1.5 top-2 rounded-lg p-1.5 text-base-content/35 transition-all hover:bg-base-content/5 hover:text-base-content/75"
              >
                <Show when={showValue()} fallback={<Eye size={15} />}>
                  <EyeOff size={15} />
                </Show>
              </button>
            </div>
          </Field>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Proyecto">
              <ProjectSelect projects={projects()} value={projectId()} onChange={setProjectId} />
            </Field>
            <Field label="Entorno">
              <div class="flex flex-wrap items-center gap-1.5">
                <For each={ENV_PRESETS}>
                  {(env) => {
                    const active = () => environments().includes(env);
                    return (
                      <button
                        type="button"
                        onClick={() => toggleEnv(env)}
                        aria-pressed={active()}
                        class={`h-8 rounded-lg border px-2.5 text-xs font-medium transition-all ${
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
                <button
                  type="button"
                  onClick={toggleAllEnvs}
                  class={`h-8 rounded-lg border px-2.5 text-xs font-semibold transition-all ${
                    allEnvs()
                      ? 'border-ios-blue-500/40 bg-ios-blue-500 text-white'
                      : 'border-dashed border-base-content/15 bg-transparent text-base-content/45 hover:text-base-content/75'
                  }`}
                >
                  Todos
                </button>
              </div>
            </Field>
          </div>

          <Field label="Etiquetas">
            <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-base-content/[0.07] bg-base-content/[0.04] px-2 py-1.5 transition-all focus-within:ring-2 focus-within:ring-ios-blue-500/30">
              <For each={tags()}>
                {(t) => (
                  <span class="inline-flex items-center gap-1 rounded-md bg-ios-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-ios-blue-500">
                    {t}
                    <button type="button" onClick={() => removeTag(t)} aria-label={`Quitar ${t}`} class="hover:text-ios-blue-600">
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
                class="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm focus:outline-none"
              />
            </div>
            <Show when={TAG_SUGGESTIONS.some((s) => !tags().includes(s))}>
              <div class="flex flex-wrap gap-1 pt-1.5">
                <For each={TAG_SUGGESTIONS.filter((s) => !tags().includes(s)).slice(0, 8)}>
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

          <Show when={error()}>
            <div class="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-red-500">
              <AlertCircle size={14} class="mt-0.5 shrink-0" />
              <p class="text-xs">{error()}</p>
            </div>
          </Show>
        </div>

        {/* Footer */}
        <div class="flex justify-end gap-2 border-t border-base-content/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-xl px-4 py-2 text-sm font-medium text-base-content/60 transition-colors hover:bg-base-content/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit()}
            class="rounded-xl bg-ios-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ios-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting() ? 'Guardando…' : isEdit() ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecretEditor;
