import { createEffect, createSignal, on, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import type { WikiArticle, WikiSuggestedLink, LibrarianStatus } from '../types';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { X, Check, Loader2, Trash2, BookOpen, Clock, ArrowLeft, AlertCircle } from 'lucide-solid';
import { ContentEditor, type ContentEditorHandle } from './ContentEditor';
import { processWikiLinks } from '../lib/wikiLinks';
import CopyForAgentButton from './CopyForAgentButton';
import { renderAll as renderMermaid, revertAll as revertMermaid } from '../lib/mermaid';
import { isDark } from '../lib/theme';

interface Props {
  article: WikiArticle;
  onClose: () => void;
  onUpdated?: (id: string, fields: Record<string, unknown>) => void;
  onDeleted?: () => void;
  onNavigate?: (articleTitle: string) => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const WikiArticleDetail: Component<Props> = (props) => {
  const data = useData();
  const projectName = () =>
    data.projects().find((p) => p.id === props.article.project_id)?.name ?? '';
  const contextLabel = () => {
    const name = projectName();
    return name ? `Espacio: ${name}` : undefined;
  };

  const [title, setTitle] = createSignal(props.article.title);
  const [tags, setTags] = createSignal<string[]>(props.article.tags ?? []);
  const [newTag, setNewTag] = createSignal('');
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>('idle');
  const [confirming, setConfirming] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [showHistory, setShowHistory] = createSignal(false);
  const [suggestedTags, setSuggestedTags] = createSignal<string[]>(props.article.suggested_tags ?? []);
  const [suggestedLinks, setSuggestedLinks] = createSignal<WikiSuggestedLink[]>(props.article.suggested_links ?? []);
  const [summary, setSummary] = createSignal(props.article.summary ?? '');
  const [librarianStatus, setLibrarianStatus] = createSignal<LibrarianStatus>(props.article.librarian_status ?? 'pending');
  const [librarianMode, setLibrarianMode] = createSignal<string>('auto');
  let editorHandle: ContentEditorHandle | undefined;
  let editorEl: HTMLElement | undefined;
  let editorFocused = false;
  let unmounted = false;
  const mermaidOpts = { shouldAbort: () => unmounted || editorFocused };
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => { unmounted = true; });
  createEffect(on(isDark, (dark) => {
    if (editorEl && !editorFocused) void renderMermaid(editorEl, dark, mermaidOpts);
  }, { defer: true }));

  onMount(() => {
    // Snapshot current state once when opening (not on every save)
    if (props.article.content?.trim()) {
      api.wiki.snapshot(props.article.id).catch(() => {});
    }
    // Fetch librarian mode setting
    api.team.getSettings().then(s => setLibrarianMode(s.librarian_mode ?? 'auto')).catch(() => {});

    // Escape key closes modal (unless a sub-modal is open)
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirming() && !showHistory()) {
        props.onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Body scroll lock while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    onCleanup(() => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = originalOverflow;
    });
  });

  onCleanup(() => {
    clearTimeout(debounceTimer);
    clearTimeout(savedTimer);
  });

  const scheduleSave = (fields: Record<string, unknown>) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await api.wiki.update(props.article.id, fields);
        setSaveStatus('saved');
        props.onUpdated?.(props.article.id, fields);
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch { setSaveStatus('error'); }
    }, 800);
  };

  const addTag = () => {
    const t = newTag().trim().toLowerCase();
    if (!t || tags().includes(t)) { setNewTag(''); return; }
    const next = [...tags(), t];
    setTags(next);
    setNewTag('');
    scheduleSave({ tags: next });
  };

  const removeTag = (tag: string) => {
    const next = tags().filter(t => t !== tag);
    setTags(next);
    scheduleSave({ tags: next });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.wiki.delete(props.article.id);
      props.onDeleted?.();
      props.onClose();
    } catch { setDeleting(false); }
  };

  const acceptTag = async (tag: string) => {
    try {
      const updated = await api.wiki.acceptSuggestion(props.article.id, { type: 'tag', value: tag });
      setSuggestedTags(updated.suggested_tags ?? []);
      setTags(updated.tags ?? []);
      props.onUpdated?.(props.article.id, { tags: updated.tags });
    } catch {}
  };

  const acceptLink = async (title: string) => {
    try {
      const updated = await api.wiki.acceptSuggestion(props.article.id, { type: 'link', value: title });
      setSuggestedLinks(updated.suggested_links ?? []);
      // Insert the link in the editor (frontend handles content, not server)
      editorHandle?.insertAtEnd(`[[${title}]]`);
    } catch {}
  };

  const dismissLink = async (title: string) => {
    try {
      const updated = await api.wiki.dismissSuggestion(props.article.id, { type: 'link', value: title });
      setSuggestedLinks(updated.suggested_links ?? []);
    } catch {}
  };

  const formatHistoryDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
    } catch { return dateStr; }
  };

  return (
    <div
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div class="bg-base-100/95 shadow-[0_-8px_40px_rgba(0,0,0,0.12)] sm:shadow-2xl w-full sm:max-w-5xl sm:rounded-[24px] rounded-t-[32px] sm:rounded-t-[24px] mt-auto sm:mt-0 max-h-[95vh] sm:max-h-[92vh] overflow-y-auto overflow-x-hidden border sm:border-base-content/[0.08] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 relative flex flex-col" style={{ "-ms-overflow-style": "none", "scrollbar-width": "none" }}>

      {/* Header — sticky bar */}
      <div class="sticky top-0 bg-base-100/95 backdrop-blur z-10 px-6 sm:px-10 py-3 border-b border-base-content/[0.04] flex items-center gap-3">
        <button
          onClick={() => props.onClose()}
          class="flex items-center gap-1.5 text-[11px] font-semibold text-base-content/40 hover:text-base-content/70 transition-colors"
        >
          <ArrowLeft size={14} />
          Volver
        </button>

        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-500">
          <BookOpen size={11} />
          <span class="text-[10px] font-bold">Wiki</span>
        </div>
        <Show when={librarianStatus() !== 'done'}>
          <span class={`w-1.5 h-1.5 rounded-full ${
            librarianStatus() === 'pending' ? 'bg-base-content/20 animate-pulse' :
            librarianStatus() === 'processing' ? 'bg-blue-400 animate-pulse' :
            'bg-red-400'
          }`} title={librarianStatus() === 'error' ? 'Error en análisis' : 'Analizando...'} />
        </Show>

        {/* Tags inline */}
        <div class="flex items-center gap-1 flex-wrap flex-1 min-w-0">
          <For each={tags()}>
            {(tag) => (
              <span class="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-base-content/[0.04] text-base-content/40">
                {tag}
                <button onClick={() => removeTag(tag)} class="hover:text-red-400 transition-colors">
                  <X size={8} />
                </button>
              </span>
            )}
          </For>
          <input
            type="text"
            value={newTag()}
            onInput={(e) => setNewTag(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            onBlur={() => { if (newTag().trim()) addTag(); }}
            placeholder="+ tag"
            class="text-[10px] bg-transparent outline-none w-12 text-base-content/30 placeholder:text-base-content/15"
          />
        </div>

        {/* Right actions */}
        <div class="flex items-center gap-2 shrink-0">
          <Show when={saveStatus() !== 'idle'}>
            <Show when={saveStatus() === 'saving'}><Loader2 size={12} class="text-base-content/40 animate-spin" /></Show>
            <Show when={saveStatus() === 'saved'}><Check size={12} class="text-ios-green-500" /></Show>
            <Show when={saveStatus() === 'error'}>
              <span class="flex items-center gap-1 text-red-500" title="Error al guardar — verifica tu conexión">
                <AlertCircle size={12} />
                <span class="text-[9px] font-semibold">Sin guardar</span>
              </span>
            </Show>
          </Show>

          <Show when={(props.article.history ?? []).length > 0}>
            <button
              onClick={() => setShowHistory(v => !v)}
              class={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-all ${
                showHistory()
                  ? 'bg-base-content/[0.06] text-base-content/50'
                  : 'text-base-content/25 hover:text-base-content/40'
              }`}
            >
              <Clock size={11} />
              {(props.article.history ?? []).length}
            </button>
          </Show>

          <CopyForAgentButton
            entity={{
              type: 'wiki',
              id: props.article.id,
              title: title(),
            }}
            contextLabel={contextLabel()}
          />
        </div>
      </div>

      {/* Body — centered, max-width for readability (scrolls with outer modal) */}
      <div class="flex-1">
        <div class="max-w-3xl mx-auto px-6 sm:px-10 py-8">

          {/* Title */}
          <div class="overflow-hidden mb-6">
            <textarea
              value={title()}
              rows={1}
              class="w-full text-2xl sm:text-3xl font-extrabold leading-tight text-base-content bg-transparent resize-none outline-none overflow-hidden py-1 placeholder:text-base-content/15"
              placeholder="Título del artículo"
              ref={(el) => { requestAnimationFrame(() => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }); }}
              onInput={(e) => {
                const val = e.currentTarget.value;
                setTitle(val);
                e.currentTarget.style.height = 'auto';
                e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                if (val.trim()) scheduleSave({ title: val });
              }}
            />
          </div>

          {/* Librarian summary */}
          <Show when={summary()}>
            <div class="mb-4 px-3 py-2 rounded-lg bg-purple-500/[0.04] border border-purple-500/[0.06]">
              <p class="text-[10px] font-semibold text-purple-500/40 mb-0.5">Resumen del bibliotecario</p>
              <p class="text-[12px] text-base-content/50 leading-relaxed">{summary()}</p>
            </div>
          </Show>

          {/* Librarian suggestions */}
          <Show when={librarianMode() === 'approval' && (suggestedTags().length > 0 || suggestedLinks().length > 0)}>
            <div class="mb-4 px-3 py-2.5 rounded-lg bg-base-content/[0.02] border border-base-content/[0.04]">
              <p class="text-[10px] font-bold uppercase tracking-widest text-base-content/20 mb-2">Sugerencias del bibliotecario</p>

              {/* Suggested tags */}
              <Show when={suggestedTags().length > 0}>
                <div class="flex items-center gap-1.5 flex-wrap mb-2">
                  <span class="text-[9px] text-base-content/25 shrink-0">Tags:</span>
                  <For each={suggestedTags()}>
                    {(tag) => (
                      <button
                        onClick={() => acceptTag(tag)}
                        class="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500/60 hover:bg-purple-500/20 hover:text-purple-500 transition-all"
                        title="Click para aceptar"
                      >
                        + {tag}
                      </button>
                    )}
                  </For>
                </div>
              </Show>

              {/* Suggested links */}
              <Show when={suggestedLinks().length > 0}>
                <div class="space-y-1">
                  <span class="text-[9px] text-base-content/25">Links:</span>
                  <For each={suggestedLinks()}>
                    {(link) => (
                      <div class="flex items-center gap-2 group">
                        <button
                          onClick={() => acceptLink(link.title)}
                          class="text-[10px] font-medium text-purple-500/50 hover:text-purple-500 transition-colors"
                        >
                          → [[{link.title}]]
                        </button>
                        <span class="text-[9px] text-base-content/15 truncate">{link.reason}</span>
                        <button
                          onClick={() => dismissLink(link.title)}
                          class="text-[9px] text-base-content/15 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-auto shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          {/* History panel (inline, collapsible) */}
          <Show when={showHistory()}>
            <div class="mb-6 rounded-xl border border-base-content/[0.06] bg-base-content/[0.02] p-4">
              <p class="text-[10px] font-bold uppercase tracking-widest text-base-content/25 mb-3">Historial de cambios</p>
              <div class="space-y-1 max-h-[200px] overflow-y-auto">
                <For each={[...(props.article.history ?? [])].reverse()}>
                  {(entry: any) => (
                    <div class="flex items-start gap-3 py-1.5 text-[11px]">
                      <span class="text-base-content/30 shrink-0 font-mono text-[10px]">
                        {formatHistoryDate(entry.at)}
                      </span>
                      <span class="text-base-content/40 truncate flex-1">{entry.preview || entry.title}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Content — full width editor */}
          <ContentEditor
            content={props.article.content || ''}
            placeholder="Escribe aquí... soporta **markdown** y [[wiki links]]"
            onChange={(md) => scheduleSave({ content: md })}
            processHtml={processWikiLinks}
            onLinkClick={(target) => props.onNavigate?.(target)}
            onReady={(handle) => { editorHandle = handle; }}
            onEditorMount={(el) => {
              editorEl = el;
              void renderMermaid(el, isDark(), mermaidOpts);
            }}
            onEditorFocus={() => { editorFocused = true; if (editorEl) revertMermaid(editorEl); }}
            onEditorBlur={() => { editorFocused = false; if (editorEl) void renderMermaid(editorEl, isDark(), mermaidOpts); }}
          />
        </div>
      </div>

      {/* Footer — delete action */}
      <div class="shrink-0 px-6 sm:px-10 py-3 border-t border-base-content/[0.04]">
        <div class="max-w-3xl mx-auto">
          <Show
            when={confirming()}
            fallback={
              <button onClick={() => setConfirming(true)} class="flex items-center gap-1.5 text-[11px] font-semibold text-base-content/20 hover:text-red-500 hover:bg-red-500/10 px-2.5 py-1.5 rounded-lg transition-all">
                <Trash2 size={12} /> Eliminar artículo
              </button>
            }
          >
            <div class="flex items-center gap-3">
              <span class="text-[11px] font-medium text-red-500">¿Eliminar?</span>
              <button onClick={() => setConfirming(false)} disabled={deleting()} class="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-base-content/[0.04] text-base-content/60 hover:bg-base-content/10 transition-all">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting()} class="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-all disabled:opacity-50">
                {deleting() ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </Show>
        </div>
      </div>
      </div>
    </div>
  );
};

export default WikiArticleDetail;
