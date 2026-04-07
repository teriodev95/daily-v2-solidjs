import { createSignal, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import type { WikiArticle } from '../types';
import { api } from '../lib/api';
import { X, Check, Loader2, Trash2, BookOpen, Tag } from 'lucide-solid';
import { ContentEditor } from './ContentEditor';

interface Props {
  article: WikiArticle;
  onClose: () => void;
  onUpdated?: (id: string, fields: Record<string, unknown>) => void;
  onDeleted?: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

const WikiArticleDetail: Component<Props> = (props) => {
  const [title, setTitle] = createSignal(props.article.title);
  const [tags, setTags] = createSignal<string[]>(props.article.tags ?? []);
  const [newTag, setNewTag] = createSignal('');
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>('idle');
  const [confirming, setConfirming] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => { document.body.style.overflow = 'hidden'; });
  onCleanup(() => {
    clearTimeout(debounceTimer);
    clearTimeout(savedTimer);
    document.body.style.overflow = '';
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
      } catch { setSaveStatus('idle'); }
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

  const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
  document.addEventListener('keydown', handleKeyDown);
  onCleanup(() => document.removeEventListener('keydown', handleKeyDown));

  return (
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center z-[100] animate-in fade-in duration-200"
      onClick={() => props.onClose()}
    >
      <div
        class="story-detail-modal bg-base-100/95 shadow-2xl shadow-black w-full sm:max-w-2xl sm:rounded-[24px] rounded-t-[32px] mt-auto sm:mt-0 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto overflow-x-hidden relative flex flex-col"
        style={{ "-ms-overflow-style": "none", "scrollbar-width": "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="sticky top-0 bg-base-100/80 backdrop-blur-xl z-20 px-5 sm:px-6 py-3 border-b border-base-content/[0.04]">
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-500">
              <BookOpen size={12} />
              <span class="text-[11px] font-bold">Wiki</span>
            </div>
            <div class="flex items-center gap-1 ml-auto">
              <Show when={saveStatus() !== 'idle'}>
                <Show when={saveStatus() === 'saving'}><Loader2 size={12} class="text-base-content/40 animate-spin" /></Show>
                <Show when={saveStatus() === 'saved'}><Check size={12} class="text-ios-green-500" /></Show>
              </Show>
              <button onClick={() => props.onClose()} class="p-1.5 rounded-full hover:bg-base-content/10 transition-colors group">
                <X size={18} class="text-base-content/40 group-hover:text-base-content/80" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div class="px-5 sm:px-6 py-5 space-y-4 flex-1">
          {/* Title */}
          <div class="overflow-hidden">
            <textarea
              value={title()}
              rows={1}
              class="w-full text-xl sm:text-[24px] font-extrabold leading-tight text-base-content bg-transparent resize-none outline-none overflow-hidden px-1 py-1 placeholder:text-base-content/20"
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

          {/* Tags */}
          <div class="flex items-center gap-1.5 flex-wrap px-1">
            <For each={tags()}>
              {(tag) => (
                <span class="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-500">
                  {tag}
                  <button onClick={() => removeTag(tag)} class="hover:text-red-400 transition-colors">
                    <X size={10} />
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
              class="text-[11px] bg-transparent outline-none w-16 text-base-content/40 placeholder:text-base-content/20"
            />
          </div>

          {/* Content */}
          <ContentEditor
            content={props.article.content || ''}
            placeholder="Escribe aquí... soporta **markdown** y [[wiki links]]"
            onChange={(md) => scheduleSave({ content: md })}
          />
        </div>

        {/* Delete */}
        <div class="px-5 sm:px-6 py-4 border-t border-base-content/[0.04]">
          <Show
            when={confirming()}
            fallback={
              <button onClick={() => setConfirming(true)} class="flex items-center gap-2 text-[12px] font-semibold text-base-content/30 hover:text-red-500 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all">
                <Trash2 size={14} /> Eliminar
              </button>
            }
          >
            <div class="flex items-center gap-3">
              <span class="text-[12px] font-medium text-red-500">¿Eliminar este artículo?</span>
              <button onClick={() => setConfirming(false)} disabled={deleting()} class="text-[12px] font-medium px-4 py-2 rounded-xl bg-base-content/[0.04] text-base-content/60 hover:bg-base-content/10 transition-all">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting()} class="text-[12px] font-medium px-4 py-2 rounded-xl bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-all disabled:opacity-50">
                {deleting() ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default WikiArticleDetail;
