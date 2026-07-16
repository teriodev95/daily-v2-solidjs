import { For, Show, type Component } from 'solid-js';
import { CheckCircle2, Circle, Clipboard, ExternalLink, EyeOff, Inbox, PlayCircle, Trash2 } from 'lucide-solid';
import type { Story, StoryStatus } from '../../types';
import { COLUMN_ORDER, STATUS_LABELS } from './kanbanState';

const MENU_STATUS_ICONS: Record<StoryStatus, Component<{ size?: number }>> = {
  backlog: Inbox,
  todo: Circle,
  in_progress: PlayCircle,
  done: CheckCircle2,
};

const CardContextMenu: Component<{
  story: Story;
  x: number;
  y: number;
  busy: string | null;
  canHardDelete: boolean;
  onOpen: () => void;
  onCopyLink: () => void;
  onMove: (status: StoryStatus) => void;
  onHide: () => void;
  confirmingDelete: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}> = (props) => (
  <div
    data-kanban-card-menu
    role="menu"
    class="fixed z-[130] w-[220px] overflow-hidden rounded-2xl border border-base-content/[0.08] bg-base-100 py-1.5 shadow-xl shadow-black/20"
    style={{ left: `${props.x}px`, top: `${props.y}px` }}
  >
    <div class="border-b border-base-content/[0.06] px-3 py-2">
      <p class="truncate text-[12px] font-semibold text-base-content/78">{props.story.title}</p>
      <p class="mt-0.5 text-[10.5px] font-medium text-base-content/35">Historia de usuario</p>
    </div>

    <button
      type="button"
      role="menuitem"
      onClick={props.onOpen}
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-base-content/72 transition-colors hover:bg-base-content/[0.045] hover:text-base-content"
    >
      <ExternalLink size={14} />
      Abrir detalle
    </button>

    <button
      type="button"
      role="menuitem"
      disabled={props.busy === 'copy'}
      onClick={props.onCopyLink}
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-base-content/72 transition-colors hover:bg-base-content/[0.045] hover:text-base-content disabled:opacity-50"
    >
      <Clipboard size={14} />
      {props.busy === 'copy' ? 'Copiando...' : 'Copiar enlace'}
    </button>

    <div class="my-1 border-t border-base-content/[0.06]" />
    <div class="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-base-content/28">
      Mover a
    </div>
    <For each={COLUMN_ORDER}>
      {(status) => {
        const Icon = MENU_STATUS_ICONS[status];
        return (
          <button
            type="button"
            role="menuitemradio"
            aria-checked={props.story.status === status}
            disabled={props.story.status === status || props.busy === `move-${status}`}
            onClick={() => props.onMove(status)}
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] font-medium text-base-content/68 transition-colors hover:bg-base-content/[0.045] hover:text-base-content disabled:opacity-45"
          >
            <span class="flex items-center gap-2">
              <Icon size={13} />
              {STATUS_LABELS[status]}
            </span>
            <Show when={props.story.status === status}>
              <span class="h-1.5 w-1.5 rounded-full bg-ios-blue-500" />
            </Show>
          </button>
        );
      }}
    </For>

    <div class="my-1 border-t border-base-content/[0.06]" />
    <button
      type="button"
      role="menuitem"
      disabled={props.busy === 'hide'}
      onClick={props.onHide}
      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-base-content/52 transition-colors hover:bg-red-500/[0.07] hover:text-red-500 disabled:opacity-50"
    >
      <EyeOff size={14} />
      {props.busy === 'hide' ? 'Ocultando...' : 'Ocultar'}
    </button>

    <Show when={props.canHardDelete}>
      <div class="my-1 border-t border-base-content/[0.06]" />
      <Show
        when={props.confirmingDelete}
        fallback={
          <button
            type="button"
            role="menuitem"
            disabled={props.busy === 'delete'}
            onClick={props.onRequestDelete}
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-red-500/78 transition-colors hover:bg-red-500/[0.08] hover:text-red-500 disabled:opacity-50"
          >
            <Trash2 size={14} />
            Eliminar
          </button>
        }
      >
        <div class="px-3 py-2">
          <p class="text-[12px] font-semibold text-red-500">¿Eliminar esta HU?</p>
          <p class="mt-1 text-[11px] leading-snug text-base-content/42">Esta acción borra la historia y sus datos asociados.</p>
          <div class="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={props.busy === 'delete'}
              onClick={props.onCancelDelete}
              class="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-base-content/48 transition-colors hover:bg-base-content/[0.055] hover:text-base-content/75 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={props.busy === 'delete'}
              onClick={props.onConfirmDelete}
              class="rounded-lg bg-red-500/12 px-2.5 py-1.5 text-[11.5px] font-semibold text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              {props.busy === 'delete' ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </div>
      </Show>
    </Show>
  </div>
);

export default CardContextMenu;
