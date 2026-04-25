import { createSignal, onCleanup } from 'solid-js';

// Per-key transient highlight tracker. Useful for "this field just changed
// from a remote update" pulses without spamming individual signals.
//
//   const { pulse, isPulsing } = createPulse(700);
//   pulse('priority');
//   <div classList={{ 'animate-remote-pulse': isPulsing('priority') }} />
export const createPulse = (durationMs = 800) => {
  const [tick, setTick] = createSignal(0);
  const active = new Map<string, ReturnType<typeof setTimeout>>();

  const pulse = (key: string) => {
    const existing = active.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      active.delete(key);
      setTick(t => t + 1);
    }, durationMs);
    active.set(key, timer);
    setTick(t => t + 1);
  };

  const isPulsing = (key: string): boolean => {
    tick(); // track
    return active.has(key);
  };

  onCleanup(() => {
    for (const t of active.values()) clearTimeout(t);
    active.clear();
  });

  return { pulse, isPulsing };
};
