import {
  createSignal,
  createMemo,
  onCleanup,
  onMount,
  For,
  Show,
  type Component,
  type JSX,
} from 'solid-js';
import {
  Plus,
  MoreHorizontal,
  Inbox,
  Circle,
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
} from 'lucide-solid';
import type { Story, StoryStatus } from '../../types';

type DoneRange = 'week' | 'month' | 'all';

interface ColumnProps {
  status: StoryStatus;
  label: string;
  count: number;
  stories: Story[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLoadMore?: () => void;
  hasMore: boolean;
  remainingCount: number;
  onQuickAdd: (title: string) => Promise<void>;
  renderCard: (story: Story) => JSX.Element;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  isDragOver?: boolean;
  doneRange?: DoneRange;
  onDoneRangeChange?: (range: DoneRange) => void;
  emptyMessage: string;
}

const STATUS_COLOR: Record<StoryStatus, string> = {
  backlog: 'var(--color-status-backlog)',
  todo: 'var(--color-status-todo)',
  in_progress: 'var(--color-status-in-progress)',
  done: 'var(--color-status-done)',
};

// ─── DoneRangeFilter ────────────────────────────────────────
interface DoneRangeFilterProps {
  value: DoneRange;
  onChange: (range: DoneRange) => void;
}

const DONE_RANGE_LABELS: Record<DoneRange, string> = {
  week: 'Esta semana',
  month: 'Este mes',
  all: 'Siempre',
};

const DONE_RANGE_OPTIONS: DoneRange[] = ['week', 'month', 'all'];

const DoneRangeFilter: Component<DoneRangeFilterProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  let wrapRef: HTMLDivElement | undefined;

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open()) return;
      const t = e.target as Node | null;
      if (wrapRef && t && !wrapRef.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open()) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    });
  });

  return (
    <div class="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium text-base-content/60 hover:text-base-content hover:bg-base-content/5 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open()}
        aria-label="Rango de tareas hechas"
      >
        <span>{DONE_RANGE_LABELS[props.value]}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      <Show when={open()}>
        <div
          class="absolute top-full right-0 mt-1 bg-base-100 border border-base-content/[0.08] rounded-xl shadow-lg py-1 min-w-[140px] z-30"
          role="menu"
        >
          <For each={DONE_RANGE_OPTIONS}>
            {(opt) => (
              <button
                type="button"
                class={[
                  'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[12px] text-left transition-colors hover:bg-base-content/5',
                  props.value === opt
                    ? 'text-base-content font-medium'
                    : 'text-base-content/70',
                ].join(' ')}
                onClick={() => {
                  props.onChange(opt);
                  setOpen(false);
                }}
                role="menuitemradio"
                aria-checked={props.value === opt}
              >
                <span>{DONE_RANGE_LABELS[opt]}</span>
                <Show when={props.value === opt}>
                  <span
                    class="w-1.5 h-1.5 rounded-full bg-base-content/60"
                    aria-hidden="true"
                  />
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

// ─── ColumnMenu ─────────────────────────────────────────────
interface ColumnMenuProps {
  onCollapse: () => void;
}

const ColumnMenu: Component<ColumnMenuProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  let wrapRef: HTMLDivElement | undefined;

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open()) return;
      const t = e.target as Node | null;
      if (wrapRef && t && !wrapRef.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open()) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    });
  });

  return (
    <div class="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        class="p-1 rounded hover:bg-base-content/5 text-base-content/40 hover:text-base-content/80 transition-colors"
        aria-label="Opciones de columna"
        aria-haspopup="menu"
        aria-expanded={open()}
      >
        <MoreHorizontal size={14} />
      </button>
      <Show when={open()}>
        <div
          class="absolute top-full right-0 mt-1 bg-base-100 border border-base-content/[0.08] rounded-xl shadow-lg py-1 min-w-[180px] z-30"
          role="menu"
        >
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-base-content/80 hover:bg-base-content/5 text-left transition-colors"
            onClick={() => {
              setOpen(false);
              props.onCollapse();
            }}
            role="menuitem"
          >
            <ChevronLeft size={13} />
            <span>Colapsar columna</span>
          </button>
        </div>
      </Show>
    </div>
  );
};

// ─── Empty state icon per status ────────────────────────────
const EmptyIcon: Component<{ status: StoryStatus }> = (props) => {
  const common = { size: 18, class: 'text-base-content/30' } as const;
  if (props.status === 'backlog') return <Inbox {...common} />;
  if (props.status === 'todo') return <Circle {...common} />;
  if (props.status === 'in_progress') return <Activity {...common} />;
  return <CheckCircle2 {...common} />;
};

// ─── Column ─────────────────────────────────────────────────
const Column: Component<ColumnProps> = (props) => {
  const [quickAddActive, setQuickAddActive] = createSignal(false);
  const [draftTitle, setDraftTitle] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  const statusColor = createMemo(() => STATUS_COLOR[props.status]);

  const startQuickAdd = () => {
    setQuickAddActive(true);
    setDraftTitle('');
    queueMicrotask(() => inputRef?.focus());
  };

  const cancelQuickAdd = () => {
    setQuickAddActive(false);
    setDraftTitle('');
  };

  const commitQuickAdd = async () => {
    const value = draftTitle().trim();
    if (!value || submitting()) return;
    setSubmitting(true);
    try {
      await props.onQuickAdd(value);
      setDraftTitle('');
      // leave input open for another quick entry
      queueMicrotask(() => inputRef?.focus());
    } catch (e) {
      // Let parent surface the error; keep the draft intact for retry.
      console.error('quick-add failed', e);
    } finally {
      setSubmitting(false);
    }
  };

  const onInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitQuickAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelQuickAdd();
    }
  };

  const onInputBlur = () => {
    // Blur silently cancels regardless of value — the spec says never
    // accidentally create on blur.
    cancelQuickAdd();
  };

  // Collapsed view ────────────────────────────────────────
  return (
    <Show
      when={!props.collapsed}
      fallback={
        <div
          class="w-10 self-stretch flex flex-col items-center justify-start py-3 bg-base-200/40 rounded-xl border border-base-content/[0.08] cursor-pointer hover:bg-base-200/70 transition"
          onClick={() => props.onToggleCollapse()}
          role="button"
          tabIndex={0}
          aria-label={`Expandir columna ${props.label}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              props.onToggleCollapse();
            }
          }}
        >
          <div
            class="w-2 h-2 rounded-full"
            style={{ background: statusColor() }}
            aria-hidden="true"
          />
          <span class="mt-2 text-[11px] font-semibold text-base-content/60 [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
            {props.label} · {props.count}
          </span>
        </div>
      }
    >
      <div
        class={`group flex-1 min-w-0 flex flex-col gap-2 rounded-xl p-1.5 transition-[background-color,box-shadow] duration-150 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
          props.isDragOver ? 'ring-2 ring-inset' : ''
        }`}
        role="region"
        aria-label={props.label}
        onDragOver={props.onDragOver}
        onDragLeave={props.onDragLeave}
        onDrop={props.onDrop}
        style={
          props.isDragOver
            ? ({
                'background-color': `color-mix(in srgb, ${statusColor()} 7%, transparent)`,
                '--tw-ring-color': `color-mix(in srgb, ${statusColor()} 35%, transparent)`,
              } as JSX.CSSProperties)
            : undefined
        }
      >
        {/* Header */}
        <div
          class="flex items-center justify-between px-1 sticky top-0 bg-base-100/95 backdrop-blur z-10 py-2 rounded-lg"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div
              class="w-2 h-2 rounded-full shrink-0"
              style={{ background: statusColor() }}
              aria-hidden="true"
            />
            <span class="text-[13px] font-semibold text-base-content/75 truncate">
              {props.label}
            </span>
            <span
              class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-base-content/[0.06] text-[10.5px] font-semibold text-base-content/50 tabular-nums"
              title={`${props.count} tareas en ${props.label}`}
            >
              {props.count}
            </span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <Show
              when={
                props.status === 'done' &&
                props.doneRange !== undefined &&
                props.onDoneRangeChange
              }
            >
              <DoneRangeFilter
                value={props.doneRange!}
                onChange={props.onDoneRangeChange!}
              />
            </Show>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={startQuickAdd}
                class="p-1 rounded hover:bg-base-content/5 text-base-content/40 hover:text-base-content/80 transition-colors"
                title="Nueva tarea"
                aria-label={`Nueva tarea en ${props.label}`}
              >
                <Plus size={14} />
              </button>
              <ColumnMenu onCollapse={props.onToggleCollapse} />
            </div>
          </div>
        </div>

        {/* Inline quick-add (above cards so new input is visible at top) */}
        <Show when={quickAddActive()}>
          <input
            ref={inputRef}
            type="text"
            value={draftTitle()}
            onInput={(e) => setDraftTitle(e.currentTarget.value)}
            onKeyDown={onInputKeyDown}
            onBlur={onInputBlur}
            class="w-full px-3 py-2 rounded-xl bg-base-100 border-2 text-[14px] font-medium outline-none transition-colors"
            style={{ 'border-color': statusColor() }}
            placeholder="Nueva tarea..."
            aria-label={`Título de nueva tarea en ${props.label}`}
            disabled={submitting()}
          />
        </Show>

        {/* Cards or empty state */}
        <Show
          when={props.stories.length > 0}
          fallback={
            <Show when={!quickAddActive()}>
              <div class="flex flex-col items-center justify-center py-8 text-center">
                <div class="w-10 h-10 rounded-full bg-base-200/60 flex items-center justify-center mb-3">
                  <EmptyIcon status={props.status} />
                </div>
                <p class="text-[13px] text-base-content/40 italic max-w-[240px]">
                  {props.emptyMessage}
                </p>
              </div>
            </Show>
          }
        >
          <div class="flex flex-col gap-2.5">
            <For each={props.stories}>
              {(story) => props.renderCard(story)}
            </For>
          </div>
        </Show>

        {/* Load more */}
        <Show when={props.hasMore && props.onLoadMore}>
          <button
            type="button"
            onClick={() => props.onLoadMore?.()}
            class="mt-1 px-3 py-2 text-[12px] font-medium rounded-lg hover:bg-base-content/5 transition-all self-start"
            style={{ color: statusColor() }}
            aria-label={`Cargar ${props.remainingCount} tareas más en ${props.label}`}
          >
            Ver {props.remainingCount} más
          </button>
        </Show>
      </div>
    </Show>
  );
};

export default Column;
