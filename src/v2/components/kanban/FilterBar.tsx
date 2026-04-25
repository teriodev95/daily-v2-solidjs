import {
  createSignal,
  createEffect,
  onCleanup,
  onMount,
  For,
  Show,
  type Component,
} from 'solid-js';
import { User as UserIcon, Users as UsersIcon, ChevronDown, X } from 'lucide-solid';
import type { Project } from '../../types';

interface FilterBarProps {
  scope: 'mine' | 'all';
  onScopeChange: (scope: 'mine' | 'all') => void;
  allProjects: Project[];
  selectedProjectIds: string[];
  onToggleProject: (id: string) => void;
  onClearProjects: () => void;
}

const FilterBar: Component<FilterBarProps> = (props) => {
  let chipsRowRef: HTMLDivElement | undefined;
  let moreWrapRef: HTMLDivElement | undefined;
  const [hiddenIds, setHiddenIds] = createSignal<string[]>([]);
  const [moreOpen, setMoreOpen] = createSignal(false);

  const isSelected = (id: string) =>
    props.selectedProjectIds.includes(id);

  const measureOverflow = () => {
    const container = chipsRowRef;
    if (!container) return;

    const chipEls = Array.from(
      container.querySelectorAll<HTMLElement>('[data-chip-id]'),
    );
    if (chipEls.length === 0) {
      setHiddenIds([]);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const firstTop = chipEls[0].getBoundingClientRect().top;
    // Row threshold: anything whose top is more than half a chip-height below
    // the first row is considered overflowed (wrap onto a new row).
    const rowTolerance = 4;

    const hidden: string[] = [];
    for (const el of chipEls) {
      const rect = el.getBoundingClientRect();
      const overflowsVertically = rect.top - firstTop > rowTolerance;
      const overflowsHorizontally = rect.right > containerRect.right + 1;
      if (overflowsVertically || overflowsHorizontally) {
        const id = el.getAttribute('data-chip-id');
        if (id) hidden.push(id);
      }
    }

    // Only update if actually changed to avoid loops
    const current = hiddenIds();
    if (
      current.length !== hidden.length ||
      current.some((id, i) => id !== hidden[i])
    ) {
      setHiddenIds(hidden);
    }
  };

  onMount(() => {
    measureOverflow();
    const ro = new ResizeObserver(() => measureOverflow());
    if (chipsRowRef) ro.observe(chipsRowRef);
    onCleanup(() => ro.disconnect());

    const onWinResize = () => measureOverflow();
    window.addEventListener('resize', onWinResize);
    onCleanup(() => window.removeEventListener('resize', onWinResize));
  });

  // Re-measure when project list or selection changes.
  createEffect(() => {
    // Track dependencies:
    props.allProjects.length;
    props.selectedProjectIds.length;
    queueMicrotask(() => measureOverflow());
  });

  // Click-outside + escape handling for "Más" dropdown.
  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!moreOpen()) return;
      const target = e.target as Node | null;
      if (moreWrapRef && target && !moreWrapRef.contains(target)) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && moreOpen()) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    });
  });

  const hiddenProjects = () =>
    props.allProjects.filter((p) => hiddenIds().includes(p.id));

  const chipClass = (active: boolean) =>
    [
      'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] leading-none transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-base-content/20',
      active
        ? 'bg-base-100 text-base-content font-semibold ring-2 shadow-sm shadow-base-content/5'
        : 'bg-base-100 border border-base-content/[0.08] text-base-content/62 font-semibold hover:bg-base-content/5 hover:text-base-content/78',
    ].join(' ');

  const scopeBtnClass = (active: boolean) =>
    [
      'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium leading-none transition-all',
      active
        ? 'bg-base-100 shadow-sm text-base-content'
        : 'text-base-content/50 hover:text-base-content/80',
    ].join(' ');

  return (
    <div class="flex min-h-10 items-center gap-2.5">
      {/* Scope segmented control */}
      <div
        class="inline-flex h-10 shrink-0 items-center rounded-full border border-base-content/[0.08] bg-base-200/60 p-1"
        role="group"
        aria-label="Ámbito del tablero"
      >
        <button
          type="button"
          class={scopeBtnClass(props.scope === 'mine')}
          onClick={() => props.onScopeChange('mine')}
          aria-pressed={props.scope === 'mine'}
        >
          <UserIcon size={13} />
          <span>Mías</span>
        </button>
        <button
          type="button"
          class={scopeBtnClass(props.scope === 'all')}
          onClick={() => props.onScopeChange('all')}
          aria-pressed={props.scope === 'all'}
        >
          <UsersIcon size={13} />
          <span>Todos</span>
        </button>
      </div>

      {/* Chips row with wrap-and-hide overflow */}
      <div class="flex-1 min-w-0 relative">
        <div
          ref={chipsRowRef}
          class="flex h-10 max-h-10 flex-wrap items-center gap-1.5 overflow-hidden px-1 py-1 -mx-1"
          aria-label="Filtrar por proyecto"
        >
          <For each={props.allProjects}>
            {(project) => {
              const active = () => isSelected(project.id);
              return (
                <button
                  type="button"
                  data-chip-id={project.id}
                  class={chipClass(active())}
                  style={active() ? { '--tw-ring-color': project.color } : undefined}
                  onClick={() => props.onToggleProject(project.id)}
                  aria-pressed={active()}
                  title={`${project.prefix} · ${project.name}`}
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ background: project.color }}
                    aria-hidden="true"
                  />
                  <span
                    class={active() ? 'text-base-content/82' : 'text-base-content/58'}
                  >
                    {project.prefix}
                  </span>
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* Overflow dropdown + Limpiar */}
      <div class="relative flex h-10 shrink-0 items-center gap-1.5" ref={moreWrapRef}>
        <Show when={hiddenIds().length > 0}>
          <button
            type="button"
            class={chipClass(false) + ' gap-1.5'}
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen()}
            aria-haspopup="menu"
            title="Más proyectos"
          >
            <span>Más ({hiddenIds().length})</span>
            <ChevronDown
              size={13}
              class={`transition-transform ${moreOpen() ? 'rotate-180' : ''}`}
            />
          </button>
          <Show when={moreOpen()}>
            <div
              class="absolute top-full right-0 z-40 mt-2 flex min-w-[220px] max-w-[320px] flex-wrap gap-1.5 rounded-2xl border border-base-content/[0.08] bg-base-100 p-2 shadow-lg"
              role="menu"
              aria-label="Más proyectos"
            >
              <For each={hiddenProjects()}>
                {(project) => {
                  const active = () => isSelected(project.id);
                  return (
                    <button
                      type="button"
                      class={chipClass(active())}
                      style={active() ? { '--tw-ring-color': project.color } : undefined}
                      onClick={() => props.onToggleProject(project.id)}
                      role="menuitemcheckbox"
                      aria-checked={active()}
                      title={`${project.prefix} · ${project.name}`}
                    >
                      <span
                        class="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: project.color }}
                        aria-hidden="true"
                      />
                      <span
                        class={active() ? 'text-base-content/82' : 'text-base-content/58'}
                      >
                        {project.prefix}
                      </span>
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={props.selectedProjectIds.length > 0}>
          <button
            type="button"
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base-content/36 transition-colors hover:bg-base-content/[0.045] hover:text-base-content/68 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-content/18"
            onClick={() => props.onClearProjects()}
            aria-label="Limpiar filtros de proyecto"
            title="Limpiar filtros"
          >
            <X size={14} />
          </button>
        </Show>
      </div>
    </div>
  );
};

export default FilterBar;
