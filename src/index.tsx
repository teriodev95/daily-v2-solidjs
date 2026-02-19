/* @refresh reload */
import { render } from 'solid-js/web';

import './index.css';
// import App from './App';  // v1 - preserved
import AppV2 from './v2/AppV2';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

render(() => <AppV2 />, root!);
