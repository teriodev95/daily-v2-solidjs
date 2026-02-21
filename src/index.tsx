/* @refresh reload */
import { render } from 'solid-js/web';
import { registerSW } from 'virtual:pwa-register';

import './index.css';
// import App from './App';  // v1 - preserved
import AppV2 from './v2/AppV2';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

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

render(() => <AppV2 />, root!);
