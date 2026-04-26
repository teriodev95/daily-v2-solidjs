import { createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import { Check, Maximize2, PanelRightOpen, Square } from 'lucide-solid';

export type DetailViewMode = 'normal' | 'fullscreen' | 'sidebar';

const DETAIL_VIEW_MODE_STORAGE_KEY = 'dc-story-detail-view-mode';

const detailViewModeOptions: Array<{
  value: DetailViewMode;
  label: string;
  icon: any;
}> = [
  { value: 'normal', label: 'Normal', icon: Square },
  { value: 'fullscreen', label: 'Pantalla completa', icon: Maximize2 },
  { value: 'sidebar', label: 'Barra lateral', icon: PanelRightOpen },
];

const isDetailViewMode = (value: string | null): value is DetailViewMode =>
  value === 'normal' || value === 'fullscreen' || value === 'sidebar';

export const readDetailViewMode = (): DetailViewMode => {
  if (typeof window === 'undefined') return 'normal';
  try {
    const stored = window.localStorage.getItem(DETAIL_VIEW_MODE_STORAGE_KEY);
    return isDetailViewMode(stored) ? stored : 'normal';
  } catch {
    return 'normal';
  }
};

const persistDetailViewMode = (mode: DetailViewMode) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DETAIL_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // LocalStorage may be unavailable in private contexts; the selection still works for this session.
  }
};

const DetailViewPreview: Component<{ mode: DetailViewMode; active: boolean }> = (props) => (
  <span
    class={`relative flex h-8 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
      props.active
        ? 'border-ios-blue-500/24 bg-ios-blue-500/[0.055]'
        : 'border-base-content/[0.06] bg-transparent'
    }`}
    aria-hidden="true"
  >
    <Show when={props.mode === 'normal'}>
      <span class="h-3.5 w-6 rounded-[3px] border border-current/25 bg-current/[0.035]" />
    </Show>
    <Show when={props.mode === 'fullscreen'}>
      <span class="h-4 w-7 rounded-[3px] border border-current/25 bg-current/[0.035]" />
    </Show>
    <Show when={props.mode === 'sidebar'}>
      <span class="flex h-4 w-7 overflow-hidden rounded-[3px] border border-current/25 bg-current/[0.035]">
        <span class="h-full flex-1 border-r border-current/20" />
        <span class="h-full w-2.5 bg-current/[0.09]" />
      </span>
    </Show>
  </span>
);

interface Props {
  mode: DetailViewMode;
  onChange: (mode: DetailViewMode) => void;
}

const DetailViewModeControl: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
  let menuRef: HTMLDivElement | undefined;

  const currentOption = () =>
    detailViewModeOptions.find((option) => option.value === props.mode) ?? detailViewModeOptions[0];

  const selectMode = (mode: DetailViewMode) => {
    props.onChange(mode);
    persistDetailViewMode(mode);
    setOpen(false);
  };

  onMount(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (!open()) return;
      const target = e.target as Node | null;
      if (target && menuRef?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !open()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);

    onCleanup(() => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    });
  });

  return (
    <div
      ref={menuRef}
      class="relative hidden sm:block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusIn={() => setOpen(true)}
      onFocusOut={(e) => {
        const next = e.relatedTarget as Node | null;
        if (!next || !menuRef?.contains(next)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="Cambiar vista"
        aria-haspopup="menu"
        aria-expanded={open()}
        title="Cambiar vista"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-base-content/38 hover:bg-base-content/[0.055] hover:text-base-content/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-ios-blue-500/35 transition-[background-color,color,opacity,box-shadow]"
      >
        {(() => {
          const ViewIcon = currentOption().icon;
          return <ViewIcon size={17} strokeWidth={2.2} />;
        })()}
      </button>
      <Show when={open()}>
        <div
          class="absolute right-0 top-full z-40 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            role="menu"
            aria-label="Vista del detalle"
            class="w-[228px] rounded-2xl border border-base-content/[0.07] bg-base-100/95 p-1.5 shadow-xl shadow-black/18 backdrop-blur-xl"
          >
            <For each={detailViewModeOptions}>
              {(option) => {
                const selected = () => props.mode === option.value;
                const OptionIcon = option.icon;
                return (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected()}
                    onClick={() => selectMode(option.value)}
                    class={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors ${
                      selected()
                        ? 'bg-ios-blue-500/[0.055] text-ios-blue-500'
                        : 'text-base-content/55 hover:bg-base-content/[0.045] hover:text-base-content/80'
                    }`}
                  >
                    <DetailViewPreview mode={option.value} active={selected()} />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[12px] font-semibold">{option.label}</span>
                    </span>
                    <Show when={selected()}>
                      <Check size={13} class="shrink-0" strokeWidth={2.4} />
                    </Show>
                    <Show when={!selected()}>
                      <OptionIcon size={13} class="shrink-0 opacity-45" strokeWidth={2.2} />
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default DetailViewModeControl;
