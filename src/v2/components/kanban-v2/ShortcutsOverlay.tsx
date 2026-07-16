import type { Component } from 'solid-js';
import { Command, X } from 'lucide-solid';

const ShortcutsOverlay: Component<{ onClose: () => void }> = (props) => (
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-base-content/30 p-4 backdrop-blur-sm"
    onClick={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}
  >
    <div class="w-full max-w-md overflow-hidden rounded-2xl border border-base-content/[0.08] bg-base-100 shadow-xl">
      <div class="flex items-center justify-between border-b border-base-content/[0.06] px-5 py-4">
        <div class="flex items-center gap-2">
          <Command size={16} class="text-base-content/60" />
          <h2 class="text-[15px] font-semibold text-base-content">Atajos</h2>
        </div>
        <button type="button" onClick={props.onClose} class="rounded-lg p-1.5 text-base-content/40 hover:bg-base-content/5 hover:text-base-content">
          <X size={16} />
        </button>
      </div>
      <div class="grid gap-2 p-5 text-[13px] text-base-content/70">
        <p><kbd class="rounded bg-base-200 px-1.5 py-0.5 font-mono text-[11px]">N</kbd> agregar en columna enfocada</p>
        <p><kbd class="rounded bg-base-200 px-1.5 py-0.5 font-mono text-[11px]">Enter</kbd> abrir tarjeta</p>
        <p><kbd class="rounded bg-base-200 px-1.5 py-0.5 font-mono text-[11px]">Esc</kbd> cerrar o limpiar foco</p>
        <p>Flechas para navegar entre tarjetas y columnas.</p>
      </div>
    </div>
  </div>
);

export default ShortcutsOverlay;
