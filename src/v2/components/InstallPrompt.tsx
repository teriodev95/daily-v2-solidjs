import { createSignal, onMount, onCleanup, Show, type Component } from 'solid-js';
import { X, Download } from 'lucide-solid';

const DISMISSED_KEY = 'dc-pwa-install-dismissed';
const SHOW_DELAY = 10_000; // 10 seconds

const InstallPrompt: Component = () => {
  const [showPrompt, setShowPrompt] = createSignal(false);
  const [deferredPrompt, setDeferredPrompt] = createSignal<any>(null);

  onMount(() => {
    // Don't show if already dismissed or already installed
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShowPrompt(true), SHOW_DELAY);
    };

    window.addEventListener('beforeinstallprompt', handler);
    onCleanup(() => window.removeEventListener('beforeinstallprompt', handler));
  });

  const handleInstall = async () => {
    const prompt = deferredPrompt();
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setShowPrompt(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
  };

  return (
    <Show when={showPrompt()}>
      <div class="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[60] animate-toast-in">
        <div class="flex items-center gap-3 bg-base-200/90 backdrop-blur-2xl border border-base-content/[0.08] rounded-2xl shadow-2xl shadow-black/30 px-4 py-3 max-w-sm">
          <div class="w-10 h-10 rounded-xl bg-ios-blue-500/15 flex items-center justify-center shrink-0">
            <Download size={20} class="text-ios-blue-500" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-base-content/90">Instalar Daily Check</p>
            <p class="text-[11px] text-base-content/40">Acceso rápido desde tu escritorio</p>
          </div>
          <button
            onClick={handleInstall}
            class="px-3 py-1.5 bg-ios-blue-500 text-white text-xs font-semibold rounded-xl hover:bg-ios-blue-600 transition-colors shrink-0"
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            class="p-1.5 rounded-lg text-base-content/30 hover:text-base-content/60 hover:bg-base-content/5 transition-all shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </Show>
  );
};

export default InstallPrompt;
