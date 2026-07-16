import { createSignal, onCleanup } from 'solid-js';
import type { Story, StoryStatus } from '../../types';
import { COLUMN_ORDER } from './kanbanState';

export interface DropTarget {
  status: StoryStatus;
  beforeId: string | null;
  afterId: string | null;
}

export interface PointerDragState {
  story: Story;
  fromStatus: StoryStatus;
  fromIndex: number;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  started: boolean;
}

const DRAG_THRESHOLD = 6;

interface KanbanDragOptions {
  /** Pointer released before crossing the threshold: a plain tap/click on the card. */
  onTap: (drag: PointerDragState) => void;
  /** The drag crossed the threshold and became active. */
  onDragStart: (drag: PointerDragState) => void;
  /** Card dropped on a valid column target. */
  onDrop: (storyId: string, target: DropTarget) => void;
}

/**
 * Pointer-events drag machine for the kanban board. Owns the drag lifecycle
 * (threshold, ghost position, drop-target hit-testing against
 * `data-kanban-column-status` / `data-kanban-card-id`) and nothing else;
 * data updates happen in the caller via `onDrop`.
 */
export const createKanbanDrag = (options: KanbanDragOptions) => {
  const [activeDrag, setActiveDrag] = createSignal<PointerDragState | null>(null);
  const [dropTarget, setDropTarget] = createSignal<DropTarget | null>(null);
  const [suppressCardClick, setSuppressCardClick] = createSignal(false);

  let clickSuppressTimer: ReturnType<typeof setTimeout> | undefined;
  let previousUserSelect = '';
  let previousCursor = '';

  const draggingId = () => activeDrag()?.started ? activeDrag()!.story.id : null;

  const setDocumentDragMode = (enabled: boolean) => {
    if (enabled) {
      previousUserSelect = document.body.style.userSelect;
      previousCursor = document.body.style.cursor;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      return;
    }
    document.body.style.userSelect = previousUserSelect;
    document.body.style.cursor = previousCursor;
  };

  const suppressNextClick = () => {
    setSuppressCardClick(true);
    clearTimeout(clickSuppressTimer);
    clickSuppressTimer = setTimeout(() => setSuppressCardClick(false), 220);
  };

  const cancelDrag = () => {
    window.removeEventListener('pointermove', handlePointerMove, true);
    window.removeEventListener('pointerup', handlePointerUp, true);
    window.removeEventListener('pointercancel', handlePointerCancel, true);
    setDocumentDragMode(false);
    setActiveDrag(null);
    setDropTarget(null);
  };

  const setDragPosition = (status: StoryStatus, beforeId: string | null, afterId: string | null) => {
    if (!draggingId()) return;
    const current = dropTarget();
    if (current?.status === status && current.beforeId === beforeId && current.afterId === afterId) return;
    setDropTarget({ status, beforeId, afterId });
  };

  const findDropTarget = (x: number, y: number): DropTarget | null => {
    const element = document.elementFromPoint(x, y);
    const column = element?.closest<HTMLElement>('[data-kanban-column-status]');
    const status = column?.dataset.kanbanColumnStatus as StoryStatus | undefined;
    if (!column || !status || !COLUMN_ORDER.includes(status)) return null;

    const cards = Array.from(column.querySelectorAll<HTMLElement>('[data-kanban-card-id]'))
      .filter((el) => el.dataset.kanbanCardId !== activeDrag()?.story.id);
    if (cards.length === 0) return { status, beforeId: null, afterId: null };

    let beforeId: string | null = null;
    let afterId: string | null = null;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (y < midpoint) {
        beforeId = card.dataset.kanbanCardId ?? null;
        break;
      }
      afterId = card.dataset.kanbanCardId ?? null;
    }
    return {
      status,
      beforeId,
      afterId: beforeId ? afterId : (cards.at(-1)?.dataset.kanbanCardId ?? null),
    };
  };

  const handlePointerMove = (event: PointerEvent) => {
    const drag = activeDrag();
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const distance = Math.hypot(dx, dy);
    const shouldStart = drag.started || distance >= DRAG_THRESHOLD;

    if (!shouldStart) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.started) {
      setDocumentDragMode(true);
      options.onDragStart(drag);
    }

    setActiveDrag((current) => current && current.pointerId === event.pointerId
      ? { ...current, x: event.clientX, y: event.clientY, started: true }
      : current);

    const target = findDropTarget(event.clientX, event.clientY);
    if (target) setDragPosition(target.status, target.beforeId, target.afterId);
  };

  const handlePointerCancel = (event: PointerEvent) => {
    const drag = activeDrag();
    if (!drag || event.pointerId !== drag.pointerId) return;
    cancelDrag();
  };

  const handlePointerUp = (event: PointerEvent) => {
    const drag = activeDrag();
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopPropagation();

    if (!drag.started) {
      cancelDrag();
      options.onTap(drag);
      return;
    }

    event.preventDefault();
    suppressNextClick();
    const target = dropTarget();
    cancelDrag();
    if (target) options.onDrop(drag.story.id, target);
  };

  const beginDrag = (
    event: PointerEvent,
    story: Story,
    element: HTMLElement,
    fromStatus: StoryStatus,
    fromIndex: number,
  ) => {
    const rect = element.getBoundingClientRect();
    setActiveDrag({
      story,
      fromStatus,
      fromIndex,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      started: false,
    });
    setDropTarget(null);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
  };

  onCleanup(() => {
    clearTimeout(clickSuppressTimer);
    cancelDrag();
  });

  return { activeDrag, dropTarget, draggingId, suppressCardClick, beginDrag, cancelDrag };
};
