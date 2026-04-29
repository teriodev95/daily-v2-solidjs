/* @refresh reload */
import { render } from 'solid-js/web';
import { registerSW } from 'virtual:pwa-register';

import './index.css';
// import App from './App';  // v1 - preserved
import AppV2 from './v2/AppV2';
import { installChunkLoadRecovery } from './v2/lib/chunkRecovery';

const root = document.getElementById('root');

installChunkLoadRecovery();

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

if (import.meta.env.DEV) {
  void (async () => {
    if (!('serviceWorker' in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (!registrations.length) return;

    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    // A stale SW can keep controlling the current Chrome tab until reload.
    if (navigator.serviceWorker.controller && !sessionStorage.getItem('dc-dev-sw-cleared')) {
      sessionStorage.setItem('dc-dev-sw-cleared', '1');
      window.location.reload();
    }
  })();
} else {
  // Register service worker with periodic update checks
  registerSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60_000);
      }
    },
  });
}

render(() => <AppV2 />, root!);
