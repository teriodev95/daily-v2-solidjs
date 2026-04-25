import { Show, createMemo, type Component } from 'solid-js';
import { useAuth } from '../lib/auth';
import { presentIn } from '../lib/presence';
import PresenceAvatars from './PresenceAvatars';

// Floating pill at the bottom-right corner showing teammates currently
// online (anyone whose tab is open and authenticated). Desktop-only —
// hidden on mobile via Tailwind. The presence beat itself is registered
// in `AppShell`, so mobile users still appear here for desktop viewers.
const OnlineUsers: Component = () => {
  const auth = useAuth();
  const list = presentIn('online');

  // Hide the widget when nobody else is online — keeps the corner clean.
  const others = createMemo(() => {
    const me = auth.user()?.id;
    return me ? list().filter(p => p.user_id !== me) : list();
  });

  return (
    <Show when={others().length > 0}>
      <div
        class="hidden sm:flex fixed bottom-4 right-4 z-30 items-center gap-2 px-2.5 py-1 rounded-full bg-base-200/85 backdrop-blur-2xl border border-base-content/[0.08] shadow-sm shadow-black/10"
        aria-label="Usuarios en línea"
      >
        <span
          class="w-1.5 h-1.5 rounded-full bg-ios-green-500"
          aria-hidden="true"
        />
        <span class="text-[10px] font-semibold text-base-content/55 tracking-tight">En línea</span>
        <PresenceAvatars scope="online" excludeSelf size="sm" max={4} />
      </div>
    </Show>
  );
};

export default OnlineUsers;
