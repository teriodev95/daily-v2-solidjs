import {
  createSignal, createResource, createEffect, onCleanup, For, Show, type Component,
} from 'solid-js';
import { marked } from 'marked';
import {
  Plus, Trash2, Lock, LockOpen, ChevronUp, ChevronDown, Loader2, AlertCircle, X,
} from 'lucide-solid';
import AlmaContentEditor from './AlmaContentEditor';
import { processAlmaContent } from '../../lib/almaLinks';
import { api, type AlmaBlock } from '../../lib/api';

export type AlmaSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  almaId: string;
  fontSize?: number;
  onOpenWiki: (title: string) => void;
  onOpenSecret?: (key: string) => void;
  // Reflect persistence in the page-level indicator (reuses AlmaPage's saver).
  onSaveStatus?: (status: AlmaSaveStatus) => void;
  // Report the live character total so the Núcleo budget meter stays in sync.
  onTotalChars?: (chars: number) => void;
}

// Collapse a markdown paragraph to a single readable preview line: turn
// `[[Title|Display]]` / `[[secret:KEY]]` into their plain label and drop the
// noisiest markdown markers so the dense row stays legible.
const previewText = (md: string): string => {
  if (!md) return '';
  return md
    .replace(/\[\[(?:secret:)?(.+?)(?:\|(.+?))?\]\]/g, (_m, target: string, display?: string) => display || target)
    .replace(/^[\s#>*+-]+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Render a locked block read-only, reusing the same chip rendering as the editor.
const toReadonlyHtml = (md: string): string => processAlmaContent(marked.parse(md || '') as string);

const AlmaBlockList: Component<Props> = (props) => {
  const [blocks, { mutate, refetch }] = createResource(
    () => props.almaId,
    (id) => api.alma.blocks.list(id),
  );

  const [expandedId, setExpandedId] = createSignal<string | null>(null);
  const [busyAdd, setBusyAdd] = createSignal(false);
  const [confirmDelete, setConfirmDelete] = createSignal<AlmaBlock | null>(null);
  const [deleting, setDeleting] = createSignal(false);

  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    saveTimers.forEach((t) => clearTimeout(t));
    clearTimeout(idleTimer);
  });

  // Mirror AlmaPage's saver: flash "saved" briefly, then settle back to idle.
  const report = (status: AlmaSaveStatus) => {
    props.onSaveStatus?.(status);
    if (status === 'saved') {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => props.onSaveStatus?.('idle'), 1800);
    }
  };

  // Keep the Núcleo meter live off the in-memory blocks (server derives content lazily).
  createEffect(() => {
    const arr = blocks();
    if (!arr) return;
    props.onTotalChars?.(arr.reduce((n, b) => n + b.text.length, 0));
  });

  const lockedCount = () => (blocks() ?? []).filter((b) => b.locked).length;

  const patchOne = (id: string, fields: Partial<AlmaBlock>) =>
    mutate((prev) => (prev ?? []).map((b) => (b.id === id ? { ...b, ...fields } : b)));

  // Debounced per-block persist; edits are immediate locally, throttled remotely.
  const scheduleSave = (block: AlmaBlock, text: string) => {
    patchOne(block.id, { text });
    clearTimeout(saveTimers.get(block.id));
    saveTimers.set(block.id, setTimeout(async () => {
      report('saving');
      try {
        const { block: saved } = await api.alma.blocks.update(props.almaId, block.id, text);
        patchOne(saved.id, saved);
        report('saved');
      } catch {
        report('error');
      }
    }, 700));
  };

  const toggleExpand = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  const addBlock = async () => {
    if (busyAdd()) return;
    setBusyAdd(true);
    report('saving');
    try {
      const { block, blocks: next } = await api.alma.blocks.create(props.almaId, { text: '' });
      mutate(next);
      setExpandedId(block.id);
      report('saved');
    } catch {
      report('error');
    } finally {
      setBusyAdd(false);
    }
  };

  // Deletion is confirmed through a native modal (never a generic browser confirm).
  const handleConfirmDelete = async () => {
    const block = confirmDelete();
    if (!block || block.locked || deleting()) return;
    setDeleting(true);
    const before = blocks();
    mutate((prev) => (prev ?? []).filter((b) => b.id !== block.id));
    if (expandedId() === block.id) setExpandedId(null);
    report('saving');
    try {
      const { blocks: next } = await api.alma.blocks.remove(props.almaId, block.id);
      mutate(next);
      report('saved');
    } catch {
      mutate(before);
      report('error');
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const toggleLock = async (block: AlmaBlock) => {
    const locked = !block.locked;
    patchOne(block.id, { locked });
    report('saving');
    try {
      const { block: saved } = await api.alma.blocks.setLock(props.almaId, block.id, locked);
      patchOne(saved.id, saved);
      report('saved');
    } catch {
      patchOne(block.id, { locked: !locked });
      report('error');
    }
  };

  // Reorder via up/down buttons — robust and native-feeling; no drag fragility.
  const move = async (index: number, dir: -1 | 1) => {
    const arr = blocks() ?? [];
    const j = index + dir;
    if (j < 0 || j >= arr.length) return;
    const next = [...arr];
    [next[index], next[j]] = [next[j], next[index]];
    mutate(next);
    report('saving');
    try {
      const { blocks: server } = await api.alma.blocks.reorder(props.almaId, next.map((b) => b.id));
      mutate(server);
      report('saved');
    } catch {
      mutate(arr);
      report('error');
    }
  };

  return (
    <div>
      <Show
        when={!blocks.loading}
        fallback={
          <div class="px-4 py-4 space-y-2">
            <For each={[0, 1, 2]}>
              {() => <div class="h-4 rounded bg-base-content/[0.05] animate-pulse" />}
            </For>
          </div>
        }
      >
        <Show when={blocks.error}>
          <div class="flex items-center gap-2 px-4 py-3 text-xs text-red-500">
            <AlertCircle size={14} class="shrink-0" />
            <span class="flex-1">No se pudieron cargar los párrafos.</span>
            <button onClick={() => refetch()} class="font-semibold underline underline-offset-2">Reintentar</button>
          </div>
        </Show>

        <Show when={!blocks.error}>
          <div class="divide-y divide-base-content/[0.05]">
            <Show
              when={(blocks() ?? []).length > 0}
              fallback={
                <div class="px-4 py-5 text-center text-xs text-base-content/40">
                  Sin párrafos — agrega uno para empezar.
                </div>
              }
            >
              <For each={blocks()}>
                {(block, i) => {
                  const open = () => expandedId() === block.id;
                  const preview = () => previewText(block.text);
                  return (
                    <div class={block.locked ? 'bg-amber-500/[0.035]' : ''}>
                      {/* Dense, single-line row */}
                      <div
                        class="group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-base-content/[0.02] transition-colors"
                        onClick={() => toggleExpand(block.id)}
                        role="button"
                        aria-expanded={open()}
                      >
                        <span class="w-6 shrink-0 text-[10px] font-mono tabular-nums text-base-content/30 text-right">
                          {i() + 1}
                        </span>
                        <Show when={open()} fallback={<ChevronDown size={13} class="shrink-0 text-base-content/25" />}>
                          <ChevronUp size={13} class="shrink-0 text-base-content/40" />
                        </Show>
                        <span
                          class={`flex-1 min-w-0 text-[13px] leading-snug line-clamp-1 ${
                            preview() ? 'text-base-content/75' : 'italic text-base-content/30'
                          }`}
                        >
                          {preview() || 'Párrafo vacío'}
                        </span>

                        {/* Reorder — visible on row hover */}
                        <div class="hidden sm:flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); move(i(), -1); }}
                            disabled={i() === 0}
                            class="p-1 rounded text-base-content/30 hover:text-base-content/70 hover:bg-base-content/[0.06] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                            aria-label="Subir párrafo"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); move(i(), 1); }}
                            disabled={i() === (blocks() ?? []).length - 1}
                            class="p-1 rounded text-base-content/30 hover:text-base-content/70 hover:bg-base-content/[0.06] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                            aria-label="Bajar párrafo"
                          >
                            <ChevronDown size={13} />
                          </button>
                        </div>

                        {/* Delete — hidden when locked */}
                        <Show when={!block.locked}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(block); }}
                            class="p-1 rounded-md text-base-content/25 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 transition-all shrink-0"
                            aria-label="Borrar párrafo"
                            title="Borrar párrafo"
                          >
                            <Trash2 size={13} />
                          </button>
                        </Show>

                        {/* Lock toggle — always visible (it is a state indicator) */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleLock(block); }}
                          class={`p-1 rounded-md transition-colors shrink-0 ${
                            block.locked
                              ? 'text-amber-600 hover:bg-amber-500/15'
                              : 'text-base-content/25 hover:text-base-content/60 hover:bg-base-content/[0.06]'
                          }`}
                          aria-pressed={block.locked}
                          aria-label={block.locked ? 'Desbloquear párrafo' : 'Bloquear párrafo'}
                          title={block.locked ? 'Bloqueado — clic para editar' : 'Bloquear para evitar cambios'}
                        >
                          <Show when={block.locked} fallback={<LockOpen size={13} />}>
                            <Lock size={13} />
                          </Show>
                        </button>
                      </div>

                      {/* Expanded editor / read-only view */}
                      <Show when={open()}>
                        <div class="border-t border-base-content/[0.05] bg-base-content/[0.01]">
                          <Show
                            when={!block.locked}
                            fallback={
                              <div class="px-3 py-3">
                                <div class="flex items-center gap-1.5 mb-2 text-[10px] font-medium text-amber-600">
                                  <Lock size={11} class="shrink-0" />
                                  Bloqueado — abre el candado para editar.
                                </div>
                                <div
                                  class="prose prose-sm max-w-none text-[15px] leading-relaxed text-base-content/70
                                    prose-p:my-1.5 prose-headings:font-semibold prose-a:no-underline
                                    prose-code:bg-base-content/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md
                                    prose-code:before:content-none prose-code:after:content-none"
                                  style={{ 'font-size': props.fontSize ? `${props.fontSize}px` : undefined }}
                                  innerHTML={toReadonlyHtml(block.text) || '<span style="opacity:.4">Párrafo vacío</span>'}
                                  onClick={(e) => {
                                    const link = (e.target as Element)?.closest?.('[data-wiki-link]') as HTMLElement | null;
                                    if (!link) return;
                                    e.preventDefault();
                                    const target = link.dataset.wikiLink!;
                                    if (target.startsWith('secret:')) props.onOpenSecret?.(target.slice('secret:'.length));
                                    else props.onOpenWiki(target);
                                  }}
                                />
                              </div>
                            }
                          >
                            <AlmaContentEditor
                              content={block.text}
                              fontSize={props.fontSize}
                              placeholder="Texto del párrafo. Markdown y tablas. @ enlaza la wiki · $ referencia un secreto."
                              onChange={(md) => scheduleSave(block, md)}
                              onOpenWiki={props.onOpenWiki}
                              onOpenSecret={props.onOpenSecret}
                            />
                          </Show>
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>

            {/* Footer: add + locked count */}
            <div class="flex items-center justify-between gap-3 px-3 py-2">
              <button
                type="button"
                onClick={addBlock}
                disabled={busyAdd()}
                class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-semibold text-ios-blue-500 hover:bg-ios-blue-500/10 transition-colors disabled:opacity-40"
              >
                <Show when={busyAdd()} fallback={<Plus size={14} />}><Loader2 size={14} class="animate-spin" /></Show>
                Agregar párrafo
              </button>
              <Show when={lockedCount() > 0}>
                <span class="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600/80">
                  <Lock size={10} class="shrink-0" />
                  {lockedCount()} bloqueado{lockedCount() === 1 ? '' : 's'}
                </span>
              </Show>
            </div>
          </div>
        </Show>
      </Show>

      {/* Native delete confirmation — short, focused, matches the app's sheet style */}
      <Show when={confirmDelete()}>
        {(block) => (
          <div
            class="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget && !deleting()) setConfirmDelete(null); }}
          >
            <div class="bg-base-100 w-full sm:max-w-md sm:rounded-[24px] rounded-t-[24px] shadow-2xl">
              <div class="flex items-start justify-between px-5 py-4 border-b border-base-content/[0.06]">
                <div class="flex items-start gap-3 min-w-0">
                  <div class="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                    <Trash2 size={17} />
                  </div>
                  <div class="min-w-0">
                    <h2 class="text-base font-semibold">Quitar párrafo</h2>
                    <p class="text-xs text-base-content/40 mt-0.5 line-clamp-1">
                      {previewText(block().text) || 'Párrafo vacío'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { if (!deleting()) setConfirmDelete(null); }}
                  aria-label="Cerrar"
                  class="p-1.5 rounded-lg hover:bg-base-content/5 text-base-content/40 transition-colors shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
              <div class="px-5 py-4">
                <p class="text-sm text-base-content/70 leading-relaxed">
                  Este párrafo se eliminará de tu Alma. La acción es inmediata.
                </p>
              </div>
              <div class="px-5 py-3.5 border-t border-base-content/[0.06] flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleting()}
                  class="px-4 py-2 rounded-xl text-sm font-medium text-base-content/60 hover:bg-base-content/5 transition-colors disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting()}
                  class="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-40"
                >
                  {deleting() ? 'Quitando...' : 'Quitar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

export default AlmaBlockList;
