const CHUNK_RELOAD_KEY = 'dc-chunk-reload-at';
const RELOAD_WINDOW_MS = 30_000;

const isLocalHost = () => {
  if (typeof window === 'undefined') return true;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
};

const messageFrom = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? '');
};

export const isChunkLoadError = (error: unknown) => {
  const message = messageFrom(error).toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('unable to preload css') ||
    (message.includes('/assets/') && message.includes('.js')) ||
    (message.includes('module script') && message.includes('text/html'))
  );
};

export const chunkLoadErrorMessage =
  'La app necesita actualizar recursos después del último deploy. Recarga la página.';

export function recoverFromChunkLoadError(error: unknown): boolean {
  if (typeof window === 'undefined' || import.meta.env.DEV || isLocalHost()) return false;
  if (!isChunkLoadError(error)) return false;

  const now = Date.now();
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
  if (Number.isFinite(last) && now - last < RELOAD_WINDOW_MS) return false;

  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  window.setTimeout(() => window.location.reload(), 50);
  return true;
}

export function installChunkLoadRecovery(): void {
  if (typeof window === 'undefined' || import.meta.env.DEV || isLocalHost()) return;

  window.addEventListener('vite:preloadError', (event) => {
    const preloadEvent = event as Event & { detail?: unknown; payload?: unknown };
    if (recoverFromChunkLoadError(preloadEvent.payload ?? preloadEvent.detail ?? event)) {
      event.preventDefault();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (recoverFromChunkLoadError(event.reason)) {
      event.preventDefault();
    }
  });
}
