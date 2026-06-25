import { createSignal, onCleanup, onMount, For, Show, type Component } from 'solid-js';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-solid';
import { formatPeriod } from '../lib/format';

// Custom month/year picker for the invoice period — native `<input type=month>`
// looks generic and off-brand. Value is "YYYY-MM".
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const parse = (v: string): { year: number; month: number } => {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? '');
  const now = new Date();
  if (!m) return { year: now.getFullYear(), month: now.getMonth() };
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) - 1 };
};

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const MonthPicker: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [viewYear, setViewYear] = createSignal(parse(props.value).year);
  let ref: HTMLDivElement | undefined;

  const sel = () => parse(props.value);

  const toggle = () => {
    if (!open()) setViewYear(parse(props.value).year);
    setOpen((o) => !o);
  };

  const pick = (monthIdx: number) => {
    props.onChange(`${viewYear()}-${String(monthIdx + 1).padStart(2, '0')}`);
    setOpen(false);
  };

  const thisMonth = () => {
    const now = new Date();
    props.onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    setOpen(false);
  };

  onMount(() => {
    const onDoc = (e: MouseEvent) => { if (ref && !ref.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    });
  });

  return (
    <div class="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open()}
        class="flex w-full items-center justify-between gap-2 rounded-xl border border-base-content/[0.07] bg-base-content/[0.04] px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-ios-blue-500/30 focus:border-ios-blue-500/40"
      >
        <span class="font-medium">{formatPeriod(props.value)}</span>
        <Calendar size={15} class={`transition-colors ${open() ? 'text-ios-blue-500' : 'text-base-content/35'}`} />
      </button>

      <Show when={open()}>
        <div class="absolute left-0 z-30 mt-1.5 w-64 rounded-2xl border border-base-content/[0.08] bg-base-100 p-2.5 shadow-xl">
          {/* Year stepper */}
          <div class="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              aria-label="Año anterior"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-base-content/50 transition-colors hover:bg-base-content/[0.06]"
            >
              <ChevronLeft size={16} />
            </button>
            <span class="text-sm font-bold tabular-nums">{viewYear()}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              aria-label="Año siguiente"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-base-content/50 transition-colors hover:bg-base-content/[0.06]"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Month grid */}
          <div class="grid grid-cols-3 gap-1">
            <For each={MONTHS}>
              {(label, i) => {
                const active = () => sel().year === viewYear() && sel().month === i();
                return (
                  <button
                    type="button"
                    onClick={() => pick(i())}
                    class={`rounded-lg py-2 text-[13px] font-semibold transition-colors ${
                      active()
                        ? 'bg-ios-blue-500 text-white'
                        : 'text-base-content/70 hover:bg-base-content/[0.06]'
                    }`}
                  >
                    {label}
                  </button>
                );
              }}
            </For>
          </div>

          {/* Shortcut */}
          <div class="mt-2 flex justify-end border-t border-base-content/[0.06] pt-2">
            <button
              type="button"
              onClick={thisMonth}
              class="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-ios-blue-500 transition-colors hover:bg-ios-blue-500/10"
            >
              Este mes
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default MonthPicker;
