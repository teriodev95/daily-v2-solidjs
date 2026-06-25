import {
  createSignal, createResource, createMemo, onCleanup, For, Show, type Component,
} from 'solid-js';
import {
  BrainCircuit, Plus, Trash2, ChevronRight, ChevronDown, Layers, BookText,
  Bot, User as UserIcon, AlertCircle, Check, Loader2, X, Type, Lock,
} from 'lucide-solid';
import TopNavigation from '../components/TopNavigation';
import WikiArticleDetail from '../components/WikiArticleDetail';
import AlmaContentEditor from '../components/alma/AlmaContentEditor';
import { api, type AlmaDoc } from '../lib/api';
import type { WikiArticle } from '../types';
import { useOnceReady } from '../lib/onceReady';

// Rough token estimate shared with the live budget meter on Tier 0.
const estimateTokens = (text: string): number => Math.ceil((text?.length ?? 0) / 4);
const TIER0_BUDGET = 1500;

// Font-size presets for the content — handy when a note grows long.
const FONT_SIZES = [
  { label: 'S', px: 13 },
  { label: 'M', px: 15 },
  { label: 'L', px: 17 },
  { label: 'XL', px: 20 },
];
const readFontPx = (): number => {
  try {
    const v = Number(localStorage.getItem('alma-font-size'));
    if (FONT_SIZES.some((f) => f.px === v)) return v;
  } catch { /* ignore */ }
  return 15;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const AlmaPage: Component = () => {
  const [docs, { mutate, refetch }] = createResource(() => api.alma.list());
  const ready = useOnceReady(docs);

  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>('idle');
  const [openIds, setOpenIds] = createSignal<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = createSignal<AlmaDoc | null>(null);
  const [deleting, setDeleting] = createSignal(false);
  const [wikiArticle, setWikiArticle] = createSignal<WikiArticle | null>(null);
  const [creatingTier, setCreatingTier] = createSignal<1 | 2 | null>(null);
  const [fontPx, setFontPx] = createSignal<number>(readFontPx());
  const [secretInfo, setSecretInfo] = createSignal<string | null>(null);
  let secretInfoTimer: ReturnType<typeof setTimeout> | undefined;

  const setFont = (px: number) => {
    setFontPx(px);
    try { localStorage.setItem('alma-font-size', String(px)); } catch { /* ignore */ }
  };
  // Clicking a secret reference never reveals a value — make that certain.
  const openSecretRef = (key: string) => {
    setSecretInfo(`Secreto «${key}»: es una referencia. Gestiónalo en Admin → Secretos; aquí no se muestra su valor.`);
    clearTimeout(secretInfoTimer);
    secretInfoTimer = setTimeout(() => setSecretInfo(null), 4000);
  };

  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    saveTimers.forEach((t) => clearTimeout(t));
    clearTimeout(savedTimer);
    clearTimeout(secretInfoTimer);
  });

  const list = () => docs() ?? [];
  const tier0 = createMemo(() => list().find((d) => d.tier === 0) ?? null);
  const tier1 = createMemo(() => list().filter((d) => d.tier === 1).sort((a, b) => a.sort - b.sort));
  const tier2 = createMemo(() => list().filter((d) => d.tier === 2).sort((a, b) => a.sort - b.sort));

  const patchLocal = (id: string, fields: Partial<AlmaDoc>) => {
    mutate((prev) => (prev ?? []).map((d) => (d.id === id ? { ...d, ...fields } : d)));
  };

  // Debounced persist per-doc. Field edits are immediate locally, throttled remotely.
  const scheduleSave = (id: string, fields: Partial<Pick<AlmaDoc, 'kind' | 'title' | 'content' | 'tags' | 'tier'>>) => {
    patchLocal(id, fields);
    clearTimeout(saveTimers.get(id));
    saveTimers.set(id, setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await api.alma.update(id, fields);
        setSaveStatus('saved');
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => setSaveStatus('idle'), 1800);
      } catch {
        setSaveStatus('error');
      }
    }, 700));
  };

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addDoc = async (tier: 1 | 2) => {
    if (creatingTier()) return;
    setCreatingTier(tier);
    try {
      const created = await api.alma.create({
        tier,
        kind: tier === 1 ? 'dominio' : 'referencia',
        title: tier === 1 ? 'Nuevo dominio' : 'Nueva referencia',
      });
      mutate((prev) => [...(prev ?? []), created]);
      setOpenIds((prev) => new Set(prev).add(created.id));
    } catch {
      setSaveStatus('error');
    } finally {
      setCreatingTier(null);
    }
  };

  const handleDelete = async () => {
    const doc = confirmDelete();
    if (!doc || deleting()) return;
    setDeleting(true);
    try {
      await api.alma.remove(doc.id);
      mutate((prev) => (prev ?? []).filter((d) => d.id !== doc.id));
      setConfirmDelete(null);
    } catch {
      setSaveStatus('error');
    } finally {
      setDeleting(false);
    }
  };

  // Resolve an @-inserted wiki link to a real article and open it in place.
  const openWikiByTitle = async (title: string) => {
    try {
      const article = await api.wiki.resolve(title, '');
      setWikiArticle(article);
    } catch {
      try {
        const results = await api.wiki.search(title);
        const found = results.find((a) => a.title.toLowerCase() === title.toLowerCase()) ?? results[0];
        if (found) setWikiArticle(found);
      } catch { /* link points nowhere yet — no-op */ }
    }
  };

  const isEmpty = () => {
    const t0 = tier0();
    return !t0?.content?.trim() && tier1().length === 0 && tier2().length === 0;
  };

  return (
    <>
      <TopNavigation
        breadcrumbs={[{ label: 'Alma', icon: <BrainCircuit size={14} /> }]}
        actions={
          <Show when={saveStatus() !== 'idle'}>
            <span class="inline-flex items-center gap-1.5 px-2 text-[11px] font-medium text-base-content/50">
              <Show when={saveStatus() === 'saving'}><Loader2 size={12} class="animate-spin" /> Guardando</Show>
              <Show when={saveStatus() === 'saved'}><Check size={12} class="text-ios-green-500" /> Guardado</Show>
              <Show when={saveStatus() === 'error'}><AlertCircle size={12} class="text-red-500" /> Sin guardar</Show>
            </span>
          </Show>
        }
      />

      <div class="space-y-5 max-w-3xl mx-auto">
        {/* Page header */}
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="text-lg font-bold">Alma</h1>
            <p class="text-xs text-base-content/50 mt-1 max-w-xl">
              Tu memoria técnica por capas. La escribe tu agente cuando se lo indicas y tú la curas:
              edita, quita o agrega. El núcleo viaja siempre con el agente.
            </p>
          </div>
          {/* Font size — for long notes */}
          <div class="flex shrink-0 items-center gap-0.5 rounded-lg border border-base-content/[0.08] bg-base-100 p-0.5" title="Tamaño de texto">
            <Type size={13} class="ml-1 mr-0.5 text-base-content/30" />
            <For each={FONT_SIZES}>
              {(f) => (
                <button
                  type="button"
                  onClick={() => setFont(f.px)}
                  aria-pressed={fontPx() === f.px}
                  class={`h-6 min-w-[24px] rounded-md px-1.5 text-[11px] font-semibold transition-colors ${
                    fontPx() === f.px
                      ? 'bg-ios-blue-500 text-white'
                      : 'text-base-content/45 hover:bg-base-content/[0.05] hover:text-base-content/80'
                  }`}
                >
                  {f.label}
                </button>
              )}
            </For>
          </div>
        </div>

        <Show when={ready()} fallback={<AlmaSkeleton />}>
          <Show when={docs.error}>
            <div class="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/5 border border-red-500/15 text-sm text-red-500">
              <AlertCircle size={15} class="shrink-0" />
              <span class="flex-1">No se pudo cargar tu Alma.</span>
              <button onClick={() => refetch()} class="text-xs font-semibold underline underline-offset-2">Reintentar</button>
            </div>
          </Show>

          <Show when={!docs.error}>
            {/* Empty invitation */}
            <Show when={isEmpty()}>
              <div class="bg-base-100 border border-dashed border-base-content/[0.1] rounded-2xl px-8 py-10 text-center">
                <div class="mx-auto w-12 h-12 rounded-2xl bg-ios-blue-500/10 flex items-center justify-center text-ios-blue-500 mb-3">
                  <BrainCircuit size={20} />
                </div>
                <h3 class="text-sm font-semibold">Tu Alma está vacía</h3>
                <p class="text-xs text-base-content/50 mt-1 max-w-sm mx-auto">
                  Indícale a tu agente que la rellene, o empieza tú escribiendo el núcleo.
                </p>
              </div>
            </Show>

            {/* ── Tier 0: núcleo ── */}
            <Show when={tier0()}>
              {(doc) => {
                const tokens = () => estimateTokens(doc().content);
                const ratio = () => tokens() / TIER0_BUDGET;
                const meterColor = () =>
                  tokens() > TIER0_BUDGET ? 'bg-red-500'
                    : tokens() >= 1200 ? 'bg-amber-500'
                    : 'bg-ios-green-500';
                const meterText = () =>
                  tokens() > TIER0_BUDGET ? 'text-red-500'
                    : tokens() >= 1200 ? 'text-amber-500'
                    : 'text-ios-green-500';
                return (
                  <section class="rounded-2xl border border-ios-blue-500/20 bg-ios-blue-500/[0.03] overflow-hidden">
                    <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-base-content/[0.06]">
                      <div class="flex items-center gap-2 min-w-0">
                        <div class="w-7 h-7 rounded-lg bg-ios-blue-500/10 flex items-center justify-center text-ios-blue-500 shrink-0">
                          <BrainCircuit size={15} />
                        </div>
                        <div class="min-w-0">
                          <p class="text-[13px] font-bold leading-tight">Núcleo (alma)</p>
                          <p class="text-[10px] text-base-content/40">Siempre presente. Mantenlo corto y esencial.</p>
                        </div>
                      </div>
                      {/* Live token budget meter */}
                      <div class="flex items-center gap-2 shrink-0">
                        <div class="hidden sm:block w-28 h-1.5 rounded-full bg-base-content/[0.08] overflow-hidden">
                          <div class={`h-full rounded-full transition-all ${meterColor()}`} style={{ width: `${Math.min(100, ratio() * 100)}%` }} />
                        </div>
                        <span class={`text-[11px] font-semibold tabular-nums ${meterText()}`} title="Estimación aproximada de tokens">
                          ~{tokens()} / {TIER0_BUDGET}
                        </span>
                      </div>
                    </div>
                    <AlmaContentEditor
                      content={doc().content}
                      fontSize={fontPx()}
                      placeholder="El núcleo de tu Alma: stack, convenciones, lo que el agente debe saber siempre. @ enlaza la wiki · $ referencia un secreto."
                      onChange={(md) => scheduleSave(doc().id, { content: md })}
                      onOpenWiki={openWikiByTitle}
                      onOpenSecret={openSecretRef}
                    />
                  </section>
                );
              }}
            </Show>

            {/* ── Tier 1: dominios ── */}
            <TierSection
              title="Dominios"
              subtitle="Tier 1 · contexto por área"
              icon={Layers}
              docs={tier1()}
              openIds={openIds()}
              busy={creatingTier() === 1}
              onAdd={() => addDoc(1)}
              onToggle={toggleOpen}
              onField={scheduleSave}
              onDelete={setConfirmDelete}
              onOpenWiki={openWikiByTitle}
              onOpenSecret={openSecretRef}
              fontSize={fontPx()}
            />

            {/* ── Tier 2: referencia profunda ── */}
            <TierSection
              title="Referencia profunda"
              subtitle="Tier 2 · detalle bajo demanda"
              icon={BookText}
              docs={tier2()}
              openIds={openIds()}
              busy={creatingTier() === 2}
              onAdd={() => addDoc(2)}
              onToggle={toggleOpen}
              onField={scheduleSave}
              onDelete={setConfirmDelete}
              onOpenWiki={openWikiByTitle}
              onOpenSecret={openSecretRef}
              fontSize={fontPx()}
            />
          </Show>
        </Show>
      </div>

      {/* Wiki article opened from an @-link */}
      <Show when={wikiArticle()}>
        {(article) => (
          <WikiArticleDetail
            article={article()}
            onClose={() => setWikiArticle(null)}
            onNavigate={(title) => { setWikiArticle(null); void openWikiByTitle(title); }}
          />
        )}
      </Show>

      {/* Delete confirm */}
      <Show when={confirmDelete()}>
        {(doc) => (
          <div
            class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget && !deleting()) setConfirmDelete(null); }}
          >
            <div class="bg-base-100 w-full sm:max-w-md sm:rounded-[24px] rounded-t-[24px] shadow-2xl">
              <div class="flex items-start justify-between px-5 py-4 border-b border-base-content/[0.06]">
                <div class="flex items-start gap-3">
                  <div class="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h2 class="text-base font-semibold">Quitar de tu Alma</h2>
                    <p class="text-xs text-base-content/40 mt-0.5 truncate max-w-[260px]">{doc().title}</p>
                  </div>
                </div>
                <button onClick={() => setConfirmDelete(null)} aria-label="Cerrar" class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div class="px-5 py-4">
                <p class="text-sm text-base-content/70 leading-relaxed">
                  Este documento dejará de viajar con tu agente. La acción es inmediata.
                </p>
              </div>
              <div class="px-5 py-3.5 border-t border-base-content/[0.06] flex justify-end gap-2">
                <button onClick={() => setConfirmDelete(null)} class="px-4 py-2 rounded-xl text-sm font-medium text-base-content/60 hover:bg-base-content/5 transition-colors">Cancelar</button>
                <button onClick={handleDelete} disabled={deleting()} class="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-40">
                  {deleting() ? 'Quitando...' : 'Quitar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* Secret reference info — clicking a secret chip never reveals a value */}
      <Show when={secretInfo()}>
        {(msg) => (
          <div class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] pointer-events-none px-4">
            <div class="flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl backdrop-blur-md bg-base-content/90 text-base-100 text-xs font-medium max-w-sm">
              <Lock size={13} class="shrink-0 text-amber-400" />
              <span>{msg()}</span>
            </div>
          </div>
        )}
      </Show>
    </>
  );
};

// ── Tier section (Tier 1 / Tier 2) ──────────────────

interface TierSectionProps {
  title: string;
  subtitle: string;
  icon: Component<{ size?: number; class?: string }>;
  docs: AlmaDoc[];
  openIds: Set<string>;
  busy: boolean;
  onAdd: () => void;
  onToggle: (id: string) => void;
  onField: (id: string, fields: Partial<Pick<AlmaDoc, 'kind' | 'title' | 'content' | 'tags'>>) => void;
  onDelete: (doc: AlmaDoc) => void;
  onOpenWiki: (title: string) => void;
  onOpenSecret: (key: string) => void;
  fontSize: number;
}

const TierSection: Component<TierSectionProps> = (props) => {
  const Icon = props.icon;
  return (
    <section>
      <div class="flex items-center justify-between gap-3 mb-2">
        <div class="flex items-center gap-2">
          <Icon size={14} class="text-base-content/40" />
          <div>
            <h2 class="text-sm font-semibold leading-tight">{props.title}</h2>
            <p class="text-[10px] uppercase tracking-wider text-base-content/30">{props.subtitle}</p>
          </div>
        </div>
        <button
          onClick={props.onAdd}
          disabled={props.busy}
          class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-ios-blue-500 hover:bg-ios-blue-500/10 transition-colors disabled:opacity-40"
        >
          <Show when={props.busy} fallback={<Plus size={13} />}><Loader2 size={13} class="animate-spin" /></Show>
          Agregar
        </button>
      </div>

      <Show
        when={props.docs.length > 0}
        fallback={
          <div class="rounded-xl border border-dashed border-base-content/[0.1] px-4 py-5 text-center text-xs text-base-content/40">
            Sin documentos. Tu agente puede rellenar esta capa, o agrega uno tú.
          </div>
        }
      >
        <div class="rounded-xl border border-base-content/[0.08] bg-base-100 divide-y divide-base-content/[0.05] overflow-hidden">
          <For each={props.docs}>
            {(doc) => {
              const open = () => props.openIds.has(doc.id);
              return (
                <div>
                  {/* Row header */}
                  <div class="flex items-center gap-2 px-3 py-2.5 hover:bg-base-content/[0.02] transition-colors">
                    <button
                      onClick={() => props.onToggle(doc.id)}
                      class="p-1 rounded-md text-base-content/30 hover:text-base-content/60 transition-colors shrink-0"
                      aria-label={open() ? 'Cerrar' : 'Abrir'}
                      aria-expanded={open()}
                    >
                      <Show when={open()} fallback={<ChevronRight size={15} />}><ChevronDown size={15} /></Show>
                    </button>
                    <input
                      value={doc.title}
                      onInput={(e) => props.onField(doc.id, { title: e.currentTarget.value })}
                      placeholder="Título"
                      class="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none placeholder:text-base-content/20"
                    />
                    <input
                      value={doc.kind}
                      onInput={(e) => props.onField(doc.id, { kind: e.currentTarget.value })}
                      placeholder="tipo"
                      class="w-24 shrink-0 bg-base-content/[0.04] rounded-md px-2 py-1 text-[10px] font-medium text-base-content/50 outline-none placeholder:text-base-content/20 focus:bg-base-content/[0.07] transition-colors"
                      title="Tipo / kind del documento"
                    />
                    <Show when={doc.source}>
                      <span
                        class="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-base-content/[0.04] text-base-content/40 shrink-0"
                        title={doc.source === 'agent' ? 'Escrito por el agente' : 'Escrito por ti'}
                      >
                        <Show when={doc.source === 'agent'} fallback={<UserIcon size={9} />}><Bot size={9} /></Show>
                        {doc.source === 'agent' ? 'Agente' : 'Humano'}
                      </span>
                    </Show>
                    <button
                      onClick={() => props.onDelete(doc)}
                      class="p-1.5 rounded-lg text-base-content/25 hover:text-red-500 hover:bg-red-500/10 transition-all shrink-0"
                      title="Quitar"
                      aria-label={`Quitar ${doc.title}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Inline editor */}
                  <Show when={open()}>
                    <div class="border-t border-base-content/[0.05] bg-base-content/[0.01]">
                      <TagsRow
                        tags={doc.tags ?? []}
                        onChange={(tags) => props.onField(doc.id, { tags })}
                      />
                      <AlmaContentEditor
                        content={doc.content}
                        fontSize={props.fontSize}
                        placeholder="Contenido. Markdown y tablas. @ enlaza la wiki · $ referencia un secreto."
                        onChange={(md) => props.onField(doc.id, { content: md })}
                        onOpenWiki={props.onOpenWiki}
                        onOpenSecret={props.onOpenSecret}
                      />
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );
};

// ── Tag editor row ──────────────────────────────────

const TagsRow: Component<{ tags: string[]; onChange: (tags: string[]) => void }> = (props) => {
  const [draft, setDraft] = createSignal('');
  const add = () => {
    const t = draft().trim().toLowerCase();
    if (!t || props.tags.includes(t)) { setDraft(''); return; }
    props.onChange([...props.tags, t]);
    setDraft('');
  };
  return (
    <div class="flex items-center gap-1 flex-wrap px-3 pt-2.5">
      <For each={props.tags}>
        {(tag) => (
          <span class="inline-flex items-center gap-0.5 rounded bg-base-content/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-base-content/50">
            {tag}
            <button onClick={() => props.onChange(props.tags.filter((x) => x !== tag))} class="hover:text-red-400 transition-colors" aria-label={`Quitar tag ${tag}`}>
              <X size={9} />
            </button>
          </span>
        )}
      </For>
      <input
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="+ tag"
        class="w-16 bg-transparent text-[10px] text-base-content/40 outline-none placeholder:text-base-content/20"
      />
    </div>
  );
};

const AlmaSkeleton: Component = () => (
  <div class="space-y-5">
    <div class="rounded-2xl border border-base-content/[0.08] h-40 bg-base-content/[0.02] animate-pulse" />
    <For each={[0, 1]}>
      {() => (
        <div class="rounded-xl border border-base-content/[0.08] divide-y divide-base-content/[0.05]">
          <For each={[0, 1]}>
            {() => <div class="px-3 py-3"><div class="h-3.5 w-48 rounded bg-base-content/[0.06] animate-pulse" /></div>}
          </For>
        </div>
      )}
    </For>
  </div>
);

export default AlmaPage;
