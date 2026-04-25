import { For, Show, createMemo, type Component } from 'solid-js';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { presentIn, type PresenceEntry } from '../lib/presence';
import { userColor } from '../lib/userColor';

interface Props {
  scope: string;
  excludeSelf?: boolean;
  size?: 'sm' | 'md';
  max?: number;
}

const sizes = {
  sm: { box: 'w-5 h-5', text: 'text-[8px]', ring: 'ring-2', overlap: '-ml-1' },
  md: { box: 'w-6 h-6', text: 'text-[9px]', ring: 'ring-2', overlap: '-ml-1.5' },
} as const;

const PresenceAvatars: Component<Props> = (props) => {
  const auth = useAuth();
  const data = useData();
  const list = presentIn(props.scope);
  const dim = () => sizes[props.size ?? 'md'];
  const max = () => props.max ?? 3;

  const filtered = createMemo<PresenceEntry[]>(() => {
    const all = list();
    if (!props.excludeSelf) return all;
    const me = auth.user()?.id;
    return me ? all.filter(p => p.user_id !== me) : all;
  });

  const visible = createMemo(() => filtered().slice(0, max()));
  const overflow = createMemo(() => Math.max(0, filtered().length - max()));

  return (
    <Show when={filtered().length > 0}>
      <div class="flex items-center" aria-label="Quién está aquí">
        <For each={visible()}>
          {(entry, i) => {
            const u = data.getUserById(entry.user_id);
            const name = u?.name ?? 'Miembro';
            const color = userColor(entry.user_id);
            const initial = (name.trim()[0] ?? '?').toUpperCase();
            const isEditing = entry.mode === 'editing';
            const title = `${name} · ${isEditing ? 'editando' : 'viendo'}`;

            return (
              <div
                class={`relative ${i() === 0 ? '' : dim().overlap}`}
                title={title}
              >
                <Show
                  when={u?.avatar_url}
                  fallback={
                    <div
                      class={`${dim().box} rounded-full flex items-center justify-center font-bold text-white select-none ring-2 ring-base-100 ${dim().text}`}
                      style={{ 'background-color': color }}
                    >
                      {initial}
                    </div>
                  }
                >
                  <img
                    src={u!.avatar_url!}
                    alt={name}
                    class={`${dim().box} rounded-full object-cover ring-2 ring-base-100`}
                  />
                </Show>
                <Show when={isEditing}>
                  {/* Editing ring — overlaid so it doesn't change layout. */}
                  <div
                    class={`absolute inset-0 rounded-full pointer-events-none ${dim().ring}`}
                    style={{ 'box-shadow': `0 0 0 2px ${color}` }}
                    aria-hidden="true"
                  />
                </Show>
              </div>
            );
          }}
        </For>
        <Show when={overflow() > 0}>
          <div
            class={`${dim().box} ${dim().overlap} rounded-full bg-base-content/10 text-base-content/70 ${dim().text} font-bold flex items-center justify-center ring-2 ring-base-100`}
            title={`${overflow()} más`}
          >
            +{overflow()}
          </div>
        </Show>
      </div>
    </Show>
  );
};

export default PresenceAvatars;
