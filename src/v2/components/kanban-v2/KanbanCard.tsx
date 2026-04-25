import { For, Show, type Component, type JSX } from 'solid-js';
import { AlertCircle, MoreHorizontal, RefreshCw } from 'lucide-solid';
import type { Project, Story, User } from '../../types';
import { formatRelativeDueDate, type DueVariant } from '../../lib/relativeDate';
import PresenceAvatars from '../PresenceAvatars';

interface KanbanCardProps {
  story: Story;
  project?: Project | null;
  assignee?: User | null;
  otherAssignees?: User[];
  focused?: boolean;
  dragging?: boolean;
  suppressClick?: boolean;
  entryIndex?: number;
  onOpen: () => void;
  onMenuOpen: (event: MouseEvent, story: Story) => void;
  onPointerDownCard: (event: PointerEvent, story: Story, element: HTMLElement) => void;
}

const dueColor: Record<DueVariant, string> = {
  overdue: 'text-red-500/75 bg-red-500/[0.06]',
  today: 'text-amber-600 bg-amber-500/[0.08]',
  tomorrow: 'text-amber-600/80',
  soon: 'text-base-content/55',
  future: 'text-base-content/35',
  none: '',
};

const priorityText: Record<Story['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Critica',
};

const Avatar: Component<{ user: User }> = (props) => (
  <Show
    when={props.user.avatar_url}
    fallback={
      <span class="flex h-5 w-5 items-center justify-center rounded-full bg-base-content/[0.08] text-[9.5px] font-semibold text-base-content/55 ring-2 ring-base-100">
        {(props.user.name || props.user.email || '?').charAt(0).toUpperCase()}
      </span>
    }
  >
    <img
      src={props.user.avatar_url!}
      alt={props.user.name}
      class="h-5 w-5 rounded-full object-cover ring-2 ring-base-100"
    />
  </Show>
);

const AvatarStack: Component<{ owner?: User | null; others?: User[] }> = (props) => {
  const users = () => [
    ...(props.owner ? [props.owner] : []),
    ...(props.others ?? []),
  ];
  const visible = () => users().slice(0, 3);
  const hidden = () => Math.max(0, users().length - visible().length);
  return (
    <div class="flex items-center">
      <For each={visible()}>
        {(user, index) => (
          <span class={index() === 0 ? '' : '-ml-1.5'}>
            <Avatar user={user} />
          </span>
        )}
      </For>
      <Show when={hidden() > 0}>
        <span class="-ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-base-content/[0.08] text-[8.5px] font-bold text-base-content/45 ring-2 ring-base-100">
          +{hidden()}
        </span>
      </Show>
    </div>
  );
};

const KanbanCard: Component<KanbanCardProps> = (props) => {
  let cardRef: HTMLElement | undefined;
  const due = () => formatRelativeDueDate(props.story.due_date);
  const collaborators = () => props.otherAssignees ?? [];
  const hasAssignees = () => !!props.assignee || collaborators().length > 0;
  const priorityTone = () => {
    if (props.story.priority === 'critical') return 'bg-red-500';
    if (props.story.priority === 'high') return 'bg-orange-500';
    return null;
  };

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest('button, a, input, textarea, select, [contenteditable="true"], [data-no-card-drag]');
  };

  const handleClick: JSX.EventHandler<HTMLElement, MouseEvent> = (event) => {
    if (event.defaultPrevented) return;
    if (props.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (isInteractiveTarget(event.target)) return;
    props.onOpen();
  };

  const handleKeyDown: JSX.EventHandler<HTMLElement, KeyboardEvent> = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    props.onOpen();
  };

  const handlePointerDown: JSX.EventHandler<HTMLElement, PointerEvent> = (event) => {
    if (!cardRef || event.defaultPrevented) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (isInteractiveTarget(event.target)) return;
    props.onPointerDownCard(event, props.story, cardRef);
  };

  const handleContextMenu: JSX.EventHandler<HTMLElement, MouseEvent> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    props.onMenuOpen(event, props.story);
  };

  return (
    <article
      ref={cardRef}
      data-kanban-card-id={props.story.id}
      role="button"
      tabindex={0}
      aria-label={`${props.story.title}, prioridad ${priorityText[props.story.priority]}`}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      class={[
        'kanban-card-enter group relative overflow-hidden rounded-xl border bg-base-100 px-3 py-2.5',
        'border-base-content/[0.10] shadow-[0_1px_2px_rgba(31,35,41,0.035),0_3px_10px_rgba(31,35,41,0.022)]',
        'transition-[border-color,background-color,opacity] duration-150',
        'cursor-pointer select-none hover:bg-base-content/[0.018] hover:border-base-content/[0.16]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/35',
        props.focused ? 'border-ios-blue-500 ring-1 ring-ios-blue-500/25' : '',
        props.dragging ? 'opacity-35' : '',
      ].filter(Boolean).join(' ')}
      style={{
        '--kanban-card-delay': `${Math.min((props.entryIndex ?? 0) * 28, 168)}ms`,
      }}
    >
      <button
        type="button"
        data-no-card-drag
        aria-label="Opciones de historia"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onMenuOpen(event, props.story);
        }}
        class="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg text-base-content/28 opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-base-content/[0.055] hover:text-base-content/65 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/30"
      >
        <MoreHorizontal size={15} />
      </button>
      <div class="mb-2 flex min-h-5 items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <Show when={priorityTone()}>
            <span class={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityTone()!}`} aria-hidden="true" />
          </Show>
          <Show when={props.project}>
            <span
              class="truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none"
              style={{
                color: props.project!.color,
                'background-color': `${props.project!.color}14`,
              }}
            >
              {props.project!.prefix}
            </span>
          </Show>
          <Show when={props.story.code}>
            <span class="truncate font-mono text-[10px] font-semibold leading-none text-base-content/35">
              {props.story.code}
            </span>
          </Show>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <PresenceAvatars scope={`story:${props.story.id}`} excludeSelf size="sm" max={2} />
          <Show when={due().variant !== 'none'}>
            <span
              class={[
                'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium leading-none tabular-nums',
                dueColor[due().variant],
              ].join(' ')}
            >
              <Show when={due().variant === 'overdue'}>
                <AlertCircle size={10} strokeWidth={2.4} />
              </Show>
              {due().label}
            </span>
          </Show>
        </div>
      </div>

      <h3 class="line-clamp-2 break-words text-[13px] font-semibold leading-[1.34] text-base-content/88">
        {props.story.title}
      </h3>

      <Show when={hasAssignees() || props.story.frequency}>
        <div class="mt-2 flex items-center justify-between gap-2 border-t border-base-content/[0.06] pt-2">
          <div class="min-w-0 text-[10.5px] font-medium text-base-content/38">
            <Show when={props.story.frequency}>
              <span class="inline-flex items-center gap-1">
                <RefreshCw size={10} strokeWidth={2.2} />
                Recurrente
              </span>
            </Show>
          </div>
          <Show when={hasAssignees()}>
            <AvatarStack owner={props.assignee} others={collaborators()} />
          </Show>
        </div>
      </Show>
    </article>
  );
};

export default KanbanCard;
