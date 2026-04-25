import { createEffect, createSignal, For, Show, type Component, type JSX } from 'solid-js';
import { CheckCircle2, ChevronDown, Circle, Inbox, Loader2, MoreHorizontal, Plus } from 'lucide-solid';
import type { Story, StoryStatus } from '../../types';
import { EMPTY_MESSAGES, STATUS_COLORS, type DoneRange } from './kanbanState';

interface KanbanColumnProps {
  status: StoryStatus;
  label: string;
  count: number;
  stories: Story[];
  focused: boolean;
  quickAddToken: number;
  dropBeforeId: string | null;
  dropAfterId: string | null;
  draggingId: string | null;
  placeholderHeight: number | null;
  doneRange?: DoneRange;
  onDoneRangeChange?: (range: DoneRange) => void;
  onQuickAdd: (title: string, status: StoryStatus) => Promise<void>;
  renderCard: (story: Story) => JSX.Element;
}

const DONE_LABELS: Record<DoneRange, string> = {
  week: 'Esta semana',
  month: 'Este mes',
  all: 'Siempre',
};

const EmptyIcon: Component<{ status: StoryStatus }> = (props) => {
  if (props.status === 'backlog') return <Inbox size={18} />;
  if (props.status === 'done') return <CheckCircle2 size={18} />;
  return <Circle size={18} />;
};

const DropPlaceholder: Component<{ height: number | null }> = (props) => (
  <div
    class="my-0.5 rounded-xl border border-dashed border-ios-blue-500/28 bg-ios-blue-500/[0.045] shadow-[inset_0_0_0_1px_rgba(0,122,255,0.025)]"
    style={{ height: `${Math.max(58, props.height ?? 88)}px` }}
  />
);

const KanbanColumn: Component<KanbanColumnProps> = (props) => {
  const [adding, setAdding] = createSignal(false);
  const [draft, setDraft] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    props.quickAddToken;
    if (props.quickAddToken > 0) startQuickAdd();
  });

  const statusColor = () => STATUS_COLORS[props.status];

  const startQuickAdd = () => {
    setAdding(true);
    queueMicrotask(() => inputRef?.focus());
  };

  const cancelQuickAdd = () => {
    setAdding(false);
    setDraft('');
  };

  const commitQuickAdd = async () => {
    const title = draft().trim();
    if (!title || saving()) return;
    setSaving(true);
    try {
      await props.onQuickAdd(title, props.status);
      setDraft('');
      queueMicrotask(() => inputRef?.focus());
    } finally {
      setSaving(false);
    }
  };

  const onQuickAddKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitQuickAdd();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelQuickAdd();
    }
  };

  const showEndLine = () =>
    !!props.draggingId &&
    props.dropBeforeId === null &&
    props.dropAfterId !== null &&
    props.stories.at(-1)?.id === props.dropAfterId;

  return (
    <section
      data-kanban-column-status={props.status}
      class={[
        'flex min-w-[228px] flex-1 flex-col rounded-xl',
        props.focused ? 'bg-base-content/[0.018]' : '',
      ].filter(Boolean).join(' ')}
      aria-label={props.label}
    >
      <header class="flex h-10 items-center justify-between gap-2 px-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusColor() }} />
          <h2 class="truncate text-[12.5px] font-semibold text-base-content/70">{props.label}</h2>
          <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-base-content/[0.055] px-1.5 text-[10.5px] font-semibold text-base-content/48 tabular-nums">
            {props.count}
          </span>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Show when={props.status === 'done' && props.doneRange && props.onDoneRangeChange}>
            <button
              type="button"
              onClick={() => {
                const next = props.doneRange === 'week' ? 'month' : props.doneRange === 'month' ? 'all' : 'week';
                props.onDoneRangeChange?.(next);
              }}
              class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-base-content/50 transition-colors hover:bg-base-content/[0.05] hover:text-base-content/75"
            >
              {DONE_LABELS[props.doneRange!]}
              <ChevronDown size={12} />
            </button>
          </Show>
          <button
            type="button"
            onClick={startQuickAdd}
            class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-base-content/42 transition-colors hover:bg-base-content/[0.055] hover:text-base-content/72"
            aria-label={`Agregar en ${props.label}`}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-base-content/38 transition-colors hover:bg-base-content/[0.055] hover:text-base-content/68"
            aria-label="Opciones"
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </header>

      <Show when={menuOpen()}>
        <div class="mx-2 mb-1.5 rounded-xl border border-base-content/[0.08] bg-base-100 px-3 py-2 text-[12px] text-base-content/45 shadow-sm">
          Orden manual activo
        </div>
      </Show>

      <div
        class="flex min-h-[360px] flex-col gap-2 rounded-xl px-1.5 pb-3 pt-1 transition-colors duration-150"
      >
        <Show when={adding()}>
          <div class="rounded-xl border border-ios-blue-500/20 bg-base-100 px-3 py-2 shadow-[0_1px_2px_rgba(31,35,41,0.05)]">
            <div class="flex items-center gap-2">
              <input
                ref={inputRef}
                value={draft()}
                onInput={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={onQuickAddKeyDown}
                onBlur={() => {
                  if (!saving() && !draft().trim()) cancelQuickAdd();
                }}
                placeholder="Nueva tarea"
                class="min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-base-content/25"
              />
              <Show when={saving()}>
                <Loader2 size={13} class="animate-spin text-ios-blue-500" />
              </Show>
            </div>
          </div>
        </Show>

        <Show
          when={props.stories.length > 0}
          fallback={
            <div class="flex min-h-[150px] flex-col items-center justify-center gap-3 px-4 text-center text-base-content/30">
              <span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-base-content/[0.025]">
                <EmptyIcon status={props.status} />
              </span>
              <p class="max-w-[200px] text-[12.5px] italic leading-relaxed">{EMPTY_MESSAGES[props.status]}</p>
              <Show when={props.draggingId && props.dropBeforeId === null && props.dropAfterId === null}>
                <div class="w-full px-6">
                  <DropPlaceholder height={props.placeholderHeight} />
                </div>
              </Show>
            </div>
          }
        >
          <For each={props.stories}>
            {(story) => (
              <>
                <Show when={props.dropBeforeId === story.id}>
                  <DropPlaceholder height={props.placeholderHeight} />
                </Show>
                {props.renderCard(story)}
              </>
            )}
          </For>
          <Show when={showEndLine()}>
            <DropPlaceholder height={props.placeholderHeight} />
          </Show>
        </Show>

        <button
          type="button"
          onClick={startQuickAdd}
          class="mt-0.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-base-content/38 transition-colors hover:bg-base-content/[0.04] hover:text-base-content/64"
        >
          <Plus size={14} />
          Agregar tarjeta
        </button>
      </div>
    </section>
  );
};

export default KanbanColumn;
