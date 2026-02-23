import { createSignal, onMount, onCleanup, Show, type Component } from 'solid-js';
import { RefreshCw } from 'lucide-solid';
import { startVersionCheck, stopVersionCheck } from '../lib/versionCheck';

const UpdateToast: Component = () => {
  const [updating, setUpdating] = createSignal(false);

  onMount(() => {
    startVersionCheck(() => {
      setUpdating(true);
      setTimeout(() => window.location.reload(), 1500);
    });
  });

  onCleanup(() => stopVersionCheck());

  return (
    <Show when={updating()}>
      <div class="fixed top-4 inset-x-0 flex justify-center z-[300] animate-toast-in pointer-events-none">
        <div class="pointer-events-auto flex items-center gap-2.5 bg-base-200/90 backdrop-blur-2xl border border-base-content/[0.08] rounded-2xl shadow-2xl shadow-black/30 px-4 py-2.5">
          <RefreshCw size={14} class="text-ios-blue-500 animate-spin" />
          <span class="text-sm font-semibold text-base-content/80">Actualizando...</span>
        </div>
      </div>
    </Show>
  );
};

export default UpdateToast;
