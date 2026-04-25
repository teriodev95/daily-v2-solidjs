import { createSignal } from 'solid-js';

// Shared signal for the currently active top-level tab. Pages read it to
// decide whether realtime refetches should run now or be deferred until
// the user navigates to them. Setter is called from `AppV2.switchTab`.
export const [activeTab, setActiveTab] = createSignal<string>('report');
