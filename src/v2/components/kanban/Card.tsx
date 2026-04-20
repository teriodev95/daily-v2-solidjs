import { Show, type Component, type JSX } from 'solid-js';
import { GripVertical, RefreshCw } from 'lucide-solid';
import type { Story, Project, User, Priority, StoryStatus } from '../../types';
import { formatRelativeDueDate, type DueVariant } from '../../lib/relativeDate';

export interface KanbanCardProps {
  story: Story;
  project?: Project | null;
  assignee?: User | null;
  selected?: boolean;
  showAvatar?: boolean;
  onClick?: () => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  dragging?: boolean;
}

// ─── Priority config ────────────────────────────────
// Discrete dot in top-left corner instead of heavy border-l strip.
const priorityDotColor: Record<Priority, string> = {
  critical: 'var(--color-priority-critical)',
  high: 'var(--color-priority-high)',
  medium: 'var(--color-priority-medium)',
  low: '',
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

// ─── Due text styling ───────────────────────────────
const dueColorClass: Record<DueVariant, string> = {
  overdue: 'text-red-600 dark:text-red-400',
  today: 'text-amber-700 dark:text-amber-400',
  tomorrow: 'text-amber-600 dark:text-amber-400',
  soon: 'text-amber-600 dark:text-amber-400',
  future: 'text-base-content/50',
  none: '',
};

// ─── Avatar ──────────────────────────────────────────
const Avatar: Component<{ user: User }> = (props) => {
  const initial = () => (props.user.name || props.user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <Show
      when={props.user.avatar_url}
      fallback={
        <div
          class="w-6 h-6 rounded-full bg-base-content/10 text-base-content/70 flex items-center justify-center text-[10px] font-semibold select-none"
          aria-label={`Asignado a ${props.user.name}`}
          title={props.user.name}
        >
          {initial()}
        </div>
      }
    >
      <img
        src={props.user.avatar_url!}
        alt={props.user.name}
        class="w-6 h-6 rounded-full object-cover"
        title={props.user.name}
      />
    </Show>
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
    // Reset flag a tick later so trailing click (if any) is swallowed.
    setTimeout(() => {
      dragJustHappened = false;
    }, 0);
  };

  const handleClick: JSX.EventHandler<HTMLElement, MouseEvent> = (e) => {
    if (dragJustHappened || e.defaultPrevented) return;
    // Ignore clicks on interactive sub-elements (avatar, badge).
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

  const ariaLabel = () => {
    const parts = [
      props.story.title,
      `prioridad ${priorityLabel[props.story.priority]}`,
      `estado ${statusLabel[props.story.status]}`,
    ];
    return parts.join(', ');
  };

  const hasAssigneeShown = () => showAvatar() && !!props.assignee;

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
        'group relative bg-base-100 border border-base-content/[0.08] rounded-xl px-3 py-2.5',
        'cursor-grab active:cursor-grabbing transition-all',
        'hover:shadow-md hover:-translate-y-0.5 hover:border-base-content/15',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-status-todo)]/40 focus-visible:ring-offset-1',
        props.selected
          ? 'ring-2 ring-[var(--color-status-todo)]/30 ring-offset-1'
          : '',
        props.dragging ? 'opacity-50' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Priority dot — top-left, always visible when priority > low */}
      <Show when={priorityDotColor[props.story.priority]}>
        <span
          class="absolute top-2 left-2 w-1.5 h-1.5 rounded-full"
          style={{ 'background-color': priorityDotColor[props.story.priority] }}
          aria-hidden="true"
        />
      </Show>
      {/* Top row: grab handle (hover) + avatar */}
      <Show when={hasAssigneeShown()}>
        <div class="flex items-center justify-between gap-2 mb-2">
          <GripVertical
            size={14}
            class="text-base-content/30 opacity-0 group-hover:opacity-40 transition-opacity"
            aria-hidden="true"
          />
          <Show when={props.assignee}>
            {(user) => (
              <div data-stop-card-click>
                <Avatar user={user()} />
              </div>
            )}
          </Show>
        </div>
      </Show>

      {/* Grab handle when no avatar row is shown */}
      <Show when={!hasAssigneeShown()}>
        <div class="absolute top-2 left-2 pointer-events-none">
          <GripVertical
            size={14}
            class="text-base-content/30 opacity-0 group-hover:opacity-40 transition-opacity"
            aria-hidden="true"
          />
        </div>
      </Show>

      {/* Title — respect user input, no case transform */}
      <h3 class="text-[14px] font-medium leading-snug text-base-content/90 line-clamp-3 break-words">
        {props.story.title}
      </h3>

      {/* Bottom row: project badge + due text + recurring icon */}
      <Show
        when={
          props.project ||
          due().variant !== 'none' ||
          props.story.frequency
        }
      >
        <div class="flex items-center justify-between gap-2 mt-3">
          <div class="flex items-center gap-1.5 min-w-0">
            <Show when={props.project}>
              {(project) => (
                <span
                  data-stop-card-click
                  class="text-[10px] font-semibold uppercase tracking-wide truncate"
                  style={{ color: project().color }}
                  title={project().name}
                >
                  {project().prefix}
                </span>
              )}
            </Show>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <Show when={props.story.frequency}>
              <RefreshCw
                size={11}
                class="text-base-content/40"
                aria-label="Tarea recurrente"
              />
            </Show>
            <Show when={due().variant !== 'none'}>
              <span
                class={[
                  'text-[10px] font-medium whitespace-nowrap',
                  dueColorClass[due().variant],
                ].join(' ')}
              >
                {due().label}
              </span>
            </Show>
          </div>
        </div>
      </Show>
    </article>
  );
};

export default KanbanCard;
