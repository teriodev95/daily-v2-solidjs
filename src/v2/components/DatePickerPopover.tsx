import { createSignal, createEffect, For, Show } from 'solid-js';
import { ChevronLeft, ChevronRight } from 'lucide-solid';

interface Props {
  value: string;
  onSelect: (dateStr: string) => void;
  onClear: () => void;
  onClose: () => void;
  triggerEl: HTMLElement | null;
}

const toDateStr = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const DatePickerPopover = (props: Props) => {
  const today = new Date();
  const todayStr = toDateStr(today);
  const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [currentMonth, setCurrentMonth] = createSignal(new Date(today.getFullYear(), today.getMonth(), 1));

  createEffect(() => {
    if (props.value) {
      const d = new Date(props.value);
      d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    }
  });

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 7 : day; // Mon=1, Sun=7
  };

  const canGoPrev = () => {
    const cur = currentMonth();
    return cur.getFullYear() > minMonth.getFullYear() || cur.getMonth() > minMonth.getMonth();
  };

  const daysList = () => {
    const year = currentMonth().getFullYear();
    const month = currentMonth().getMonth();
    const daysInCurrentMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const daysInPrevMonth = getDaysInMonth(year, month - 1);
    const prevDaysCount = firstDay - 1;

    const days: { day: number; isCurrentMonth: boolean; monthOffset: number; dateStr: string }[] = [];

    for (let i = prevDaysCount - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      days.push({ day: d, isCurrentMonth: false, monthOffset: -1, dateStr: toDateStr(new Date(year, month - 1, d)) });
    }

    for (let i = 1; i <= daysInCurrentMonth; i++) {
      days.push({ day: i, isCurrentMonth: true, monthOffset: 0, dateStr: toDateStr(new Date(year, month, i)) });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, isCurrentMonth: false, monthOffset: 1, dateStr: toDateStr(new Date(year, month + 1, i)) });
    }

    return days;
  };

  const changeMonth = (offset: number) => {
    if (offset < 0 && !canGoPrev()) return;
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const monthName = () => {
    const m = currentMonth();
    const name = m.toLocaleDateString('es-ES', { month: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + m.getFullYear();
  };

  const weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  const isPast = (dateStr: string) => dateStr < todayStr;
  const isToday = (dateStr: string) => dateStr === todayStr;
  const isSelected = (dateStr: string) => props.value === dateStr;

  let popoverRef!: HTMLDivElement;

  return (
    <div
      ref={popoverRef}
      class="absolute right-0 top-full mt-2 z-50 bg-base-200 rounded-2xl border border-base-content/[0.06] shadow-2xl shadow-black/30 p-4 w-[280px] animate-ctx-menu"
    >
      {/* Header */}
      <div class="flex items-center justify-between mb-3">
        <span class="text-[13px] font-bold text-base-content/80 tracking-tight">{monthName()}</span>
        <div class="flex items-center gap-0.5">
          <button
            onClick={() => changeMonth(-1)}
            disabled={!canGoPrev()}
            class={`p-1.5 rounded-lg transition-colors ${canGoPrev() ? 'hover:bg-base-content/[0.06] text-base-content/50 hover:text-base-content/80' : 'text-base-content/10 cursor-not-allowed'}`}
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => changeMonth(1)}
            class="p-1.5 rounded-lg hover:bg-base-content/[0.06] text-base-content/50 hover:text-base-content/80 transition-colors"
          >
            <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Weekdays */}
      <div class="grid grid-cols-7 mb-1.5">
        <For each={weekdays}>
          {(day) => <div class="text-center text-[10px] font-bold text-base-content/30 uppercase">{day}</div>}
        </For>
      </div>

      {/* Days grid */}
      <div class="grid grid-cols-7 gap-0.5">
        <For each={daysList()}>
          {(d) => {
            const past = isPast(d.dateStr);
            const sel = isSelected(d.dateStr);
            const tod = isToday(d.dateStr);
            return (
              <button
                onClick={() => !past && props.onSelect(d.dateStr)}
                disabled={past}
                class={`w-full aspect-square flex items-center justify-center rounded-lg text-[12px] font-semibold transition-all relative ${
                  sel
                    ? 'bg-ios-blue-500 text-white shadow-sm shadow-ios-blue-500/30'
                    : past
                      ? 'text-base-content/10 cursor-not-allowed'
                      : d.isCurrentMonth
                        ? 'text-base-content/70 hover:bg-base-content/[0.06] hover:text-base-content'
                        : 'text-base-content/20 hover:bg-base-content/[0.04]'
                }`}
              >
                {d.day}
                <Show when={tod && !sel}>
                  <span class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-ios-blue-500" />
                </Show>
              </button>
            );
          }}
        </For>
      </div>

      {/* Footer */}
      <div class="flex justify-between items-center mt-3 pt-3 border-t border-base-content/[0.06]">
        <button onClick={() => props.onClear()} class="text-[12px] font-bold text-base-content/40 hover:text-base-content/70 transition-colors">
          Borrar
        </button>
        <button
          onClick={() => props.onSelect(todayStr)}
          class="text-[12px] font-bold text-ios-blue-500 hover:brightness-125 transition-colors"
        >
          Hoy
        </button>
      </div>
    </div>
  );
};

export default DatePickerPopover;
