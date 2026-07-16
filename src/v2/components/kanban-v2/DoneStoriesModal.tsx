import { For, Show, type Component } from 'solid-js';
import { CheckCircle2, ChevronDown, ExternalLink, Loader2, X } from 'lucide-solid';
import type { Project, Story } from '../../types';
import StoryDetail from '../StoryDetail';
import type { DoneRange } from './kanbanState';

/** Pill in the filter row that shows the done count and toggles the modal. */
export const DoneMetric: Component<{
  count: number;
  rangeLabel: string;
  open: boolean;
  onClick: () => void;
}> = (props) => (
  <button
    type="button"
    data-done-metric
    onClick={props.onClick}
    class={[
      'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-left transition-all',
      'border-base-content/[0.08] bg-base-100 text-base-content/62 shadow-sm hover:bg-base-content/[0.035] hover:text-base-content/82',
      props.open ? 'ring-2 ring-status-done/30' : '',
    ].filter(Boolean).join(' ')}
    aria-expanded={props.open}
    aria-haspopup="dialog"
    title="Ver historias hechas"
  >
    <span class="h-1.5 w-1.5 rounded-full bg-status-done" aria-hidden="true" />
    <span class="text-[12.5px] font-semibold tabular-nums">{props.count}</span>
    <span class="hidden text-[12.5px] font-medium text-base-content/45 xl:inline">{props.rangeLabel}</span>
    <ChevronDown size={13} class={`transition-transform ${props.open ? 'rotate-180' : ''}`} />
  </button>
);

const DoneStoriesModal: Component<{
  panelRef: (element: HTMLDivElement) => void;
  stories: Story[];
  selectedStory: Story | null;
  loading: boolean;
  loaded: boolean;
  range: DoneRange;
  count: number;
  onRangeChange: (range: DoneRange) => void;
  onSelectStory: (story: Story) => void;
  onMenuOpen: (event: MouseEvent, story: Story) => void;
  onClose: () => void;
  onClearSelection: () => void;
  getProject: (projectId: string | null) => Project | null;
  onStoryDeleted: (story: Story) => void;
  onStoryUpdated: (story: Story, fields: Record<string, unknown>) => void;
}> = (props) => (
  <div
    class="fixed inset-0 z-[105] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-label="Historias hechas"
    onClick={props.onClose}
  >
    <div
      ref={props.panelRef}
      class="flex h-[min(820px,88vh)] w-[min(1180px,94vw)] min-h-0 flex-col overflow-hidden rounded-[24px] border border-base-content/[0.08] bg-base-100/96"
      onClick={(event) => event.stopPropagation()}
    >
      <div class="flex items-center justify-between gap-4 border-b border-base-content/[0.06] px-5 py-4">
        <div class="flex min-w-0 items-center gap-3">
          <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-done/10 text-status-done">
            <CheckCircle2 size={18} />
          </span>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-[15px] font-semibold text-base-content/86">Hecho</h2>
              <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-base-content/[0.055] px-1.5 text-[10.5px] font-semibold text-base-content/48 tabular-nums">
                {props.count}
              </span>
            </div>
            <p class="mt-0.5 text-[11px] font-medium text-base-content/35">Historias completadas según tus filtros actuales</p>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <div class="flex rounded-full bg-base-content/[0.04] p-0.5">
            <For each={[
              ['week', 'Semana'],
              ['month', 'Mes'],
              ['all', 'Todo'],
            ] as [DoneRange, string][]}>
              {([range, label]) => (
                <button
                  type="button"
                  onClick={() => props.onRangeChange(range)}
                  class={[
                    'rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors',
                    props.range === range
                      ? 'bg-base-100 text-base-content/78'
                      : 'text-base-content/40 hover:text-base-content/68',
                  ].join(' ')}
                >
                  {label}
                </button>
              )}
            </For>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            class="inline-flex h-9 w-9 items-center justify-center rounded-full text-base-content/42 transition-colors hover:bg-base-content/[0.055] hover:text-base-content/72"
            aria-label="Cerrar Hecho"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)]">
        <aside class="min-h-0 border-r border-base-content/[0.06] bg-base-content/[0.015]">
          <div class="flex h-full min-h-0 flex-col">
            <div class="flex items-center justify-between px-4 py-3">
              <p class="text-[11px] font-bold uppercase tracking-[0.08em] text-base-content/28">Completadas</p>
              <Show when={props.loading}>
                <Loader2 size={14} class="animate-spin text-base-content/32" />
              </Show>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              <Show
                when={!props.loading}
                fallback={
                  <div class="flex items-center justify-center gap-2 px-4 py-12 text-[12.5px] font-medium text-base-content/35">
                    <Loader2 size={14} class="animate-spin" />
                    Cargando...
                  </div>
                }
              >
                <Show
                  when={props.stories.length > 0}
                  fallback={
                    <div class="px-5 py-14 text-center">
                      <CheckCircle2 size={20} class="mx-auto text-base-content/18" />
                      <p class="mt-2 text-[12.5px] font-medium text-base-content/35">
                        {props.loaded ? 'Sin historias hechas en este rango.' : 'Abre para cargar historias hechas.'}
                      </p>
                    </div>
                  }
                >
                  <div class="space-y-1">
                    <For each={props.stories}>
                      {(story) => {
                        const project = () => props.getProject(story.project_id);
                        const selected = () => props.selectedStory?.id === story.id;
                        return (
                          <button
                            type="button"
                            onClick={() => props.onSelectStory(story)}
                            onContextMenu={(event) => props.onMenuOpen(event, story)}
                            class={[
                              'group flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
                              selected()
                                ? 'bg-status-done/[0.08] text-base-content ring-1 ring-status-done/20'
                                : 'hover:bg-base-content/[0.035]',
                            ].join(' ')}
                          >
                            <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-status-done" />
                            <span class="min-w-0 flex-1">
                              <span class="block line-clamp-2 text-[12.5px] font-semibold leading-snug text-base-content/78">{story.title}</span>
                              <span class="mt-1.5 flex items-center gap-2 text-[10.5px] font-medium text-base-content/34">
                                <Show when={project()}>
                                  <span
                                    class="rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none"
                                    style={{
                                      color: project()!.color,
                                      'background-color': `${project()!.color}14`,
                                    }}
                                  >
                                    {project()!.prefix}
                                  </span>
                                </Show>
                                <Show when={story.completed_at}>
                                  <span>{new Date(story.completed_at!).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                                </Show>
                              </span>
                            </span>
                            <ExternalLink size={13} class="mt-0.5 shrink-0 text-base-content/18 opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </Show>
            </div>
          </div>
        </aside>

        <section class="min-h-0 bg-base-100 p-3">
          <Show
            when={props.selectedStory}
            keyed
            fallback={
              <div class="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-base-content/[0.08] text-center">
                <CheckCircle2 size={24} class="text-base-content/18" />
                <p class="mt-3 text-[13px] font-semibold text-base-content/48">Selecciona una historia</p>
                <p class="mt-1 max-w-[260px] text-[12px] font-medium leading-relaxed text-base-content/32">
                  Usa la lista para revisar contenido, adjuntos y propiedades sin salir de Hecho.
                </p>
              </div>
            }
          >
            {(story) => (
              <StoryDetail
                story={story}
                embedded
                onClose={props.onClearSelection}
                onDeleted={() => props.onStoryDeleted(story)}
                onUpdated={(id, fields) => props.onStoryUpdated(story, fields)}
              />
            )}
          </Show>
        </section>
      </div>
    </div>
  </div>
);

export default DoneStoriesModal;
