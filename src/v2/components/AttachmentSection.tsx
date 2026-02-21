import { createSignal, onMount, For, Show, type Component } from 'solid-js';
import type { Attachment } from '../types';
import { api } from '../lib/api';
import { Paperclip, Upload, Trash2, FileIcon, Loader2, ImagePlus } from 'lucide-solid';
import ImageLightbox from './ImageLightbox';

interface AttachmentSectionProps {
  storyId: string;
  onReady?: (uploadFn: (file: File) => Promise<void>) => void;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImage = (mime: string) => mime.startsWith('image/');

const AttachmentSection: Component<AttachmentSectionProps> = (props) => {
  // Manual state instead of createResource to avoid refetch flicker
  const [items, setItems] = createSignal<Attachment[]>([]);
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = createSignal<{ src: string; alt: string } | null>(null);
  const [dragOver, setDragOver] = createSignal(false);

  let fileInput!: HTMLInputElement;

  // Initial fetch — silent, no loading state needed
  onMount(async () => {
    try {
      const data = await api.attachments.list(props.storyId);
      setItems(data);
    } catch { /* empty list is fine */ }
  });

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 3000);
  };

  const doUpload = async (file: File) => {
    if (file.size > MAX_SIZE) {
      showError('Archivo muy grande (máx 10MB)');
      return;
    }
    setUploading(true);
    try {
      const created = await api.attachments.upload(props.storyId, file);
      // Optimistic: append to list without refetching
      setItems(prev => [...prev, created]);
    } catch (e: any) {
      showError(e.message || 'Error al subir archivo');
    } finally {
      setUploading(false);
    }
  };

  // Expose upload function for paste handler
  if (props.onReady) {
    props.onReady(doUpload);
  }

  const handleDelete = async (att: Attachment) => {
    // Optimistic: remove immediately
    setItems(prev => prev.filter(a => a.id !== att.id));
    try {
      await api.attachments.delete(att.id);
    } catch (e: any) {
      // Revert on error
      setItems(prev => [...prev, att]);
      showError(e.message || 'Error al eliminar');
    }
  };

  const handleFileSelect = () => {
    const files = fileInput.files;
    if (files && files.length > 0) {
      for (const f of Array.from(files)) doUpload(f);
      fileInput.value = '';
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOver(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (const f of Array.from(files)) doUpload(f);
    }
  };

  return (
    <>
      <div
        class="space-y-2"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div class="flex items-center gap-1.5">
          <Paperclip size={11} class="text-base-content/20" />
          <span class="text-[9px] font-bold uppercase text-base-content/20 tracking-wider">Adjuntos</span>
          <Show when={items().length > 0}>
            <span class="text-[9px] text-base-content/15">{items().length}</span>
          </Show>
          <button
            onClick={() => fileInput.click()}
            disabled={uploading()}
            class="ml-auto flex items-center gap-1 text-[10px] text-ios-blue-500 hover:text-ios-blue-400 transition-colors disabled:opacity-40"
          >
            <Show when={uploading()} fallback={<Upload size={10} />}>
              <Loader2 size={10} class="animate-spin" />
            </Show>
            {uploading() ? 'Subiendo...' : 'Subir'}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            class="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Drop zone indicator */}
        <Show when={dragOver()}>
          <div class="flex items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed border-ios-blue-500/40 bg-ios-blue-500/[0.06] text-ios-blue-500/60">
            <ImagePlus size={16} />
            <span class="text-[11px] font-medium">Suelta aquí</span>
          </div>
        </Show>

        {/* Files grid */}
        <Show when={!dragOver() && items().length > 0}>
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            <For each={items()}>
              {(att) => {
                const imgUrl = isImage(att.mime_type) ? api.attachments.fileUrl(att.id) : null;
                return (
                  <div class="group relative rounded-lg overflow-hidden bg-base-200/40 border border-base-content/[0.06] hover:border-base-content/[0.12] transition-all">
                    <Show
                      when={imgUrl}
                      fallback={
                        <div
                          class="flex flex-col items-center gap-1 px-2 py-3 cursor-pointer"
                          onClick={() => window.open(api.attachments.fileUrl(att.id), '_blank')}
                        >
                          <FileIcon size={14} class="text-base-content/25" />
                          <p class="text-[9px] font-medium truncate w-full text-center text-base-content/50">{att.file_name}</p>
                          <p class="text-[8px] text-base-content/20">{formatSize(att.file_size)}</p>
                        </div>
                      }
                    >
                      <div
                        class="cursor-pointer"
                        onClick={() => setLightboxSrc({ src: imgUrl!, alt: att.file_name })}
                      >
                        <img
                          src={imgUrl!}
                          alt={att.file_name}
                          class="w-full h-20 object-cover"
                          loading="lazy"
                        />
                        <div class="px-1.5 py-1">
                          <p class="text-[8px] truncate text-base-content/40">{att.file_name}</p>
                        </div>
                      </div>
                    </Show>

                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(att); }}
                      class="absolute top-1 right-1 p-1 rounded-md bg-black/40 text-white/70 hover:text-white hover:bg-red-500/80 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

        {/* Empty state */}
        <Show when={!dragOver() && items().length === 0 && !uploading()}>
          <button
            onClick={() => fileInput.click()}
            class="w-full flex items-center justify-center gap-1.5 py-3 rounded-lg border border-dashed border-base-content/[0.06] text-base-content/15 hover:border-base-content/12 hover:text-base-content/25 transition-all cursor-pointer"
          >
            <ImagePlus size={14} />
            <span class="text-[10px]">Arrastra, pega o selecciona</span>
          </button>
        </Show>

        {/* Uploading indicator when no items yet */}
        <Show when={uploading() && items().length === 0}>
          <div class="flex items-center justify-center gap-2 py-3 rounded-lg border border-base-content/[0.06] bg-base-content/[0.02]">
            <Loader2 size={14} class="animate-spin text-ios-blue-500/60" />
            <span class="text-[10px] text-base-content/25">Subiendo...</span>
          </div>
        </Show>

        {/* Error */}
        <Show when={error()}>
          <div class="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
            {error()}
          </div>
        </Show>
      </div>

      {/* Lightbox */}
      <Show when={lightboxSrc()}>
        {(data) => (
          <ImageLightbox
            src={data().src}
            alt={data().alt}
            onClose={() => setLightboxSrc(null)}
          />
        )}
      </Show>
    </>
  );
};

export default AttachmentSection;
