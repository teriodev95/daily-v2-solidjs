import { For, Show, type Component, type JSX } from 'solid-js';
import { RefreshCw, AlertCircle } from 'lucide-solid';
import type { Story, Project, User, Priority, StoryStatus } from '../../types';
import { formatRelativeDueDate, type DueVariant } from '../../lib/relativeDate';

export interface KanbanCardProps {
  story: Story;
  project?: Project | null;
  /** Primary assignee (owner). Rendered first in the avatar stack. */
  assignee?: User | null;
  /** Additional collaborators, rendered after the owner. */
  otherAssignees?: User[];
  selected?: boolean;
  showAvatar?: boolean;
  onClick?: () => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  dragging?: boolean;
}

// ─── Priority config ────────────────────────────────
const priorityAccent: Record<Priority, string | null> = {
  critical: 'var(--color-priority-critical)',
  high: 'var(--color-priority-high)',
  medium: null,
  low: null,
};

const priorityLabel: Record<Priority, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const statusLabel: Record<StoryStatus, string> = {
  backlog: 'Backlog',
  todo: 'Por hacer',
  in_progress: 'En progreso',
  done: 'Hecho',
};

// ─── Due styling ────────────────────────────────────
const dueColorClass: Record<DueVariant, string> = {
  overdue: 'text-red-500/75 dark:text-red-400/70 bg-red-500/[0.06]',
  today: 'text-amber-600 dark:text-amber-400/85 bg-amber-500/[0.08]',
  tomorrow: 'text-amber-600/80 dark:text-amber-400/70',
  soon: 'text-base-content/55',
  future: 'text-base-content/35',
  none: '',
};

// ─── Avatar (single) ─────────────────────────────────
const Avatar: Component<{ user: User; ring?: boolean; title?: string }> = (props) => {
  const initial = () => (props.user.name || props.user.email || '?').trim().charAt(0).toUpperCase();
  const ringClass = props.ring ? 'ring-2 ring-base-100' : '';
  return (
    <Show
      when={props.user.avatar_url}
      fallback={
        <div
          class={`w-[22px] h-[22px] rounded-full bg-base-content/10 text-base-content/65 flex items-center justify-center text-[10px] font-semibold select-none ${ringClass}`}
          aria-label={props.title ?? `Asignado a ${props.user.name}`}
          title={props.title ?? props.user.name}
        >
          {initial()}
        </div>
      }
    >
      <img
        src={props.user.avatar_url!}
        alt={props.user.name}
        class={`w-[22px] h-[22px] rounded-full object-cover ${ringClass}`}
        title={props.title ?? props.user.name}
      />
    </Show>
  );
};

// ─── Avatar stack ────────────────────────────────────
const AvatarStack: Component<{
  owner: User | null | undefined;
  others: User[];
  max?: number;
}> = (props) => {
  const max = () => props.max ?? 3;
  const ownerArr = () => (props.owner ? [props.owner] : []);
  const combined = () => [...ownerArr(), ...props.others];
  const visible = () => combined().slice(0, max());
  const hidden = () => Math.max(0, combined().length - max());

  return (
    <div class="flex items-center">
      <For each={visible()}>
        {(user, i) => (
          <div
            class={i() === 0 ? '' : '-ml-1.5'}
            title={
              i() === 0 && props.owner?.id === user.id
                ? `Encargado: ${user.name}`
                : user.name
            }
          >
            <Avatar user={user} ring title={
              i() === 0 && props.owner?.id === user.id
                ? `Encargado: ${user.name}`
                : user.name
            } />
          </div>
        )}
      </For>
      <Show when={hidden() > 0}>
        <div
          class="-ml-1.5 w-[22px] h-[22px] rounded-full bg-base-content/10 text-base-content/60 flex items-center justify-center text-[9px] font-bold ring-2 ring-base-100"
          title={`${hidden()} más`}
        >
          +{hidden()}
        </div>
      </Show>
    </div>
  );
};

// ─── Main Card ───────────────────────────────────────
export const KanbanCard: Component<KanbanCardProps> = (props) => {
  let dragJustHappened = false;

  const handleDragStart = (e: DragEvent) => {
    dragJustHappened = true;
    props.onDragStart?.(e);
  };

  const handleDragEnd = (e: DragEvent) => {
    props.onDragEnd?.(e);
    setTimeout(() => { dragJustHappened = false; }, 0);
  };

  const handleClick: JSX.EventHandler<HTMLElement, MouseEvent> = (e) => {
    if (dragJustHappened || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-stop-card-click]')) return;
    props.onClick?.();
  };

  const handleKeyDown: JSX.EventHandler<HTMLElement, KeyboardEvent> = (e) => {
    if (!props.onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      props.onClick();
    }
  };

  const due = () => formatRelativeDueDate(props.story.due_date);
  const showAvatar = () => props.showAvatar !== false;
  const hasAnyAssignee = () => showAvatar() && (!!props.assignee || (props.otherAssignees?.length ?? 0) > 0);
  const hasFooter = () => hasAnyAssignee() || !!props.story.frequency;
  const accent = () => priorityAccent[props.story.priority];

  const ariaLabel = () => [
    props.story.title,
    `prioridad ${priorityLabel[props.story.priority]}`,
    `estado ${statusLabel[props.story.status]}`,
  ].join(', ');

  return (
    <article
      role="article"
      aria-label={ariaLabel()}
      title={`Prioridad: ${priorityLabel[props.story.priority]}`}
      tabindex={props.onClick ? 0 : undefined}
      draggable={true}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      class={[
        'group relative overflow-hidden bg-base-100 border border-base-content/[0.06] rounded-[14px] px-3.5 py-3',
        'cursor-grab active:cursor-grabbing transition-all',
        'hover:border-base-content/15 hover:shadow-sm hover:-translate-y-px',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-status-todo)]/40 focus-visible:ring-offset-1',
        props.selected ? 'ring-2 ring-[var(--color-status-todo)]/40 border-transparent' : '',
        props.dragging ? 'opacity-50' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Priority accent — left edge, only for critical/high */}
      <Show when={accent()}>
        <span
          class="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ 'background-color': accent()! }}
          aria-hidden="true"
        />
      </Show>

      {/* ── Meta row (due only) ── */}
      <Show when={due().variant !== 'none'}>
        <div class="flex items-center justify-end mb-2">
          <span
            class={[
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium whitespace-nowrap tabular-nums',
              dueColorClass[due().variant],
            ].join(' ')}
          >
            <Show when={due().variant === 'overdue'}>
              <AlertCircle size={10} strokeWidth={2.4} />
            </Show>
            {due().label}
          </span>
        </div>
      </Show>

      {/* ── Title ── */}
      <h3 class="text-[13px] font-semibold leading-[1.4] text-base-content/90 line-clamp-3 break-words">
        {props.story.title}
      </h3>

      {/* ── Footer ── */}
      <Show when={hasFooter()}>
        <div class="mt-3 pt-2.5 border-t border-base-content/[0.05] flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-[10.5px] text-base-content/40 min-w-0">
            <Show when={props.story.frequency}>
              <span class="inline-flex items-center gap-1" title="Tarea recurrente">
                <RefreshCw size={10} strokeWidth={2.2} />
                <span>Recurrente</span>
              </span>
            </Show>
          </div>
          <Show when={hasAnyAssignee()}>
            <div data-stop-card-click>
              <AvatarStack
                owner={props.assignee ?? null}
                others={props.otherAssignees ?? []}
              />
            </div>
          </Show>
        </div>
      </Show>
    </article>
  );
};

export default KanbanCard;
