import type { Component } from 'solid-js';
import type { PointerDragState } from './createKanbanDrag';

const DragGhost: Component<{ drag: PointerDragState }> = (props) => (
  <div
    class="pointer-events-none fixed z-[120] overflow-hidden rounded-xl border border-base-content/[0.12] bg-base-100/95 px-3 py-2.5 opacity-95 shadow-[0_12px_30px_rgba(31,35,41,0.18)]"
    style={{
      left: `${props.drag.x - props.drag.offsetX}px`,
      top: `${props.drag.y - props.drag.offsetY}px`,
      width: `${props.drag.width}px`,
      height: `${props.drag.height}px`,
    }}
  >
    <div class="mb-2 flex min-h-5 items-center justify-between gap-2">
      <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-base-content/18" aria-hidden="true" />
      <span class="rounded-full bg-base-content/[0.05] px-2 py-0.5 text-[10.5px] font-medium leading-none text-base-content/45">
        Moviendo
      </span>
    </div>
    <h3 class="line-clamp-2 break-words text-[13px] font-semibold leading-[1.34] text-base-content/88">
      {props.drag.story.title}
    </h3>
  </div>
);

export default DragGhost;
