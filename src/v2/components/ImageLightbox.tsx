import { onMount, onCleanup, type Component } from 'solid-js';
import { X, Download } from 'lucide-solid';

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

const ImageLightbox: Component<ImageLightboxProps> = (props) => {
  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', handleKey);
    onCleanup(() => document.removeEventListener('keydown', handleKey));
  });

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = props.src;
    a.download = props.alt || 'image';
    a.click();
  };

  return (
    <div
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div class="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={handleDownload}
          class="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
          title="Descargar"
        >
          <Download size={18} />
        </button>
        <button
          onClick={props.onClose}
          class="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
          title="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      <img
        src={props.src}
        alt={props.alt}
        class="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
      />
    </div>
  );
};

export default ImageLightbox;
