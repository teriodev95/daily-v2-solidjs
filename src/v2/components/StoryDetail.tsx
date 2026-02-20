import { createSignal, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import type { Story, AcceptanceCriteria } from '../types';
import { useData } from '../lib/data';
import { api } from '../lib/api';
import {
  X, CheckCircle, Circle, Flame, ArrowUp, ArrowRight, ArrowDown,
  Calendar, Target, FileText, HelpCircle, ClipboardCheck, Trash2,
  Check, Loader2,
} from 'lucide-solid';

const priorityConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  critical: { label: 'Crítica', color: 'text-red-500', bg: 'bg-red-500/10', icon: Flame },
  high: { label: 'Alta', color: 'text-orange-500', bg: 'bg-orange-500/10', icon: ArrowUp },
  medium: { label: 'Media', color: 'text-ios-blue-500', bg: 'bg-ios-blue-500/10', icon: ArrowRight },
  low: { label: 'Baja', color: 'text-base-content/40', bg: 'bg-base-content/5', icon: ArrowDown },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  backlog: { label: 'Backlog', color: 'bg-base-content/20' },
  todo: { label: 'Por hacer', color: 'bg-ios-blue-500' },
  in_progress: { label: 'En progreso', color: 'bg-amber-500' },
  done: { label: 'Hecho', color: 'bg-ios-green-500' },
};

interface Props {
  story: Story;
  onClose: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

const StoryDetail: Component<Props> = (props) => {
  const data = useData();

  // Editable fields
  const [title, setTitle] = createSignal(props.story.title);
  const [purpose, setPurpose] = createSignal(props.story.purpose || '');
  const [description, setDescription] = createSignal(props.story.description || '');
  const [objective, setObjective] = createSignal(props.story.objective || '');

  // Save state
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>('idle');
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    clearTimeout(debounceTimer);
    clearTimeout(savedTimer);
  });

  const scheduleSave = (fields: Record<string, unknown>) => {
    clearTimeout(debounceTimer);
    setSaveStatus('idle');
    debounceTimer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await api.stories.update(props.story.id, fields);
        setSaveStatus('saved');
        props.onUpdated?.();
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 800);
  };

  // Fetch story details
  const [criteriaList, setCriteriaList] = createSignal<AcceptanceCriteria[]>([]);
  const [detailAssignees, setDetailAssignees] = createSignal<string[]>([]);
  const [confirming, setConfirming] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [deleteError, setDeleteError] = createSignal('');

  onMount(async () => {
    try {
      const detail = await api.stories.get(props.story.id);
      setCriteriaList(detail.criteria ?? []);
      setDetailAssignees(detail.assignees ?? []);
      // Sync latest values from server
      setTitle(detail.title);
      setPurpose(detail.purpose || '');
      setDescription(detail.description || '');
      setObjective(detail.objective || '');
    } catch { /* story detail is supplementary */ }
  });

  const project = () => props.story.project_id ? data.getProjectById(props.story.project_id) : null;
  const criteria = () => criteriaList();
  const assignee = () => props.story.assignee_id ? data.getUserById(props.story.assignee_id) : null;
  const extraAssignees = () => {
    const assignees = (props.story as any).assignees ?? detailAssignees();
    return assignees.map((id: string) => data.getUserById(id)).filter(Boolean);
  };
  const prio = () => priorityConfig[props.story.priority];
  const stat = () => statusConfig[props.story.status];
  const metCount = () => criteria().filter(c => c.is_met).length;
  const isRich = () => !!props.story.code;

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.stories.delete(props.story.id);
      props.onDeleted?.();
      props.onClose();
    } catch (e: any) {
      setDeleteError(e.message || 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  // Auto-resize textarea helper
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  return (
    <div
      class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={() => props.onClose()}
    >
      <div
        class="bg-base-100 w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div class="sticky top-0 bg-base-100 z-10 px-5 pt-4 pb-3 border-b border-base-300/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <Show when={props.story.code}>
                <span class="text-xs font-mono font-bold text-base-content/30">{props.story.code}</span>
              </Show>
              <Show when={project()}>
                <span
                  class="text-[10px] font-medium px-2 py-0.5 rounded-md"
                  style={{
                    "background-color": `${project()!.color}15`,
                    color: project()!.color,
                  }}
                >
                  {project()!.name}
                </span>
              </Show>
              <Show when={isRich()}>
                {(() => {
                  const PIcon = prio().icon;
                  return (
                    <span class={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md ${prio().bg} ${prio().color}`}>
                      <PIcon size={10} />
                      {prio().label}
                    </span>
                  );
                })()}
              </Show>
              <span class="flex items-center gap-1.5">
                <span class={`w-1.5 h-1.5 rounded-full ${stat().color}`} />
                <span class="text-[10px] text-base-content/40">{stat().label}</span>
              </span>

              {/* Save indicator */}
              <Show when={saveStatus() !== 'idle'}>
                <span class="flex items-center gap-1 ml-auto mr-2">
                  <Show when={saveStatus() === 'saving'}>
                    <Loader2 size={11} class="text-base-content/30 animate-spin" />
                    <span class="text-[10px] text-base-content/30">Guardando</span>
                  </Show>
                  <Show when={saveStatus() === 'saved'}>
                    <Check size={11} class="text-ios-green-500" />
                    <span class="text-[10px] text-ios-green-500/70">Guardado</span>
                  </Show>
                </span>
              </Show>
            </div>
            <button onClick={() => props.onClose()} class="p-1.5 rounded-lg hover:bg-base-content/10 transition-colors shrink-0 ml-3">
              <X size={18} class="text-base-content/40" />
            </button>
          </div>
        </div>

        <div class="px-5 py-5 space-y-5">

          {/* Title — editable */}
          <textarea
            value={title()}
            rows={1}
            class="w-full text-lg font-bold leading-snug bg-transparent resize-none outline-none rounded-lg px-2 py-1 -mx-2 border border-transparent focus:border-base-content/10 focus:bg-base-content/[0.02] transition-colors placeholder:text-base-content/20"
            placeholder="Título de la historia"
            ref={(el) => {
              requestAnimationFrame(() => autoResize(el));
            }}
            onInput={(e) => {
              const val = e.currentTarget.value;
              setTitle(val);
              autoResize(e.currentTarget);
              if (val.trim()) scheduleSave({ title: val });
            }}
          />

          {/* Meta chips */}
          <Show when={props.story.estimate > 0 || props.story.due_date}>
            <div class="flex flex-wrap items-center gap-2">
              <Show when={props.story.estimate > 0}>
                <span class="text-[10px] px-2 py-1 rounded-md bg-base-content/5 text-base-content/40">
                  {props.story.estimate} puntos
                </span>
              </Show>
              <Show when={props.story.due_date}>
                <span class="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-base-content/5 text-base-content/40">
                  <Calendar size={10} />
                  {props.story.due_date}
                </span>
              </Show>
            </div>
          </Show>

          {/* Assignees */}
          <Show when={assignee()}>
            <div class="flex items-center gap-3">
              <span class="text-[10px] font-bold uppercase tracking-wider text-base-content/25">Asignados</span>
              <div class="flex items-center -space-x-1.5">
                <img src={assignee()!.avatar_url!} alt={assignee()!.name} class="w-7 h-7 rounded-full ring-2 ring-base-100" title={assignee()!.name} />
                <For each={extraAssignees()}>
                  {(u) => (
                    <img src={u!.avatar_url!} alt={u!.name} class="w-7 h-7 rounded-full ring-2 ring-base-100" title={u!.name} />
                  )}
                </For>
              </div>
              <span class="text-xs text-base-content/40">
                {assignee()!.name}
                <Show when={extraAssignees().length > 0}>
                  {` +${extraAssignees().length}`}
                </Show>
              </span>
            </div>
          </Show>

          {/* Purpose — editable */}
          <section class="space-y-1.5">
            <div class="flex items-center gap-2">
              <HelpCircle size={13} class="text-base-content/25" />
              <h3 class="text-[10px] font-bold uppercase tracking-wider text-base-content/25">¿Para qué?</h3>
            </div>
            <textarea
              value={purpose()}
              rows={1}
              class="w-full text-sm text-base-content/70 leading-relaxed bg-transparent resize-none outline-none rounded-lg px-2 py-1 ml-3 border border-transparent focus:border-base-content/10 focus:bg-base-content/[0.02] transition-colors placeholder:text-base-content/20"
              style={{ width: 'calc(100% - 1.25rem)' }}
              placeholder="Describe el propósito..."
              ref={(el) => {
                requestAnimationFrame(() => autoResize(el));
              }}
              onInput={(e) => {
                const val = e.currentTarget.value;
                setPurpose(val);
                autoResize(e.currentTarget);
                scheduleSave({ purpose: val });
              }}
            />
          </section>

          {/* Description — editable */}
          <section class="space-y-1.5">
            <div class="flex items-center gap-2">
              <FileText size={13} class="text-base-content/25" />
              <h3 class="text-[10px] font-bold uppercase tracking-wider text-base-content/25">Descripción</h3>
            </div>
            <textarea
              value={description()}
              rows={1}
              class="w-full text-sm text-base-content/70 leading-relaxed bg-transparent resize-none outline-none rounded-lg px-2 py-1 ml-3 border border-transparent focus:border-base-content/10 focus:bg-base-content/[0.02] transition-colors whitespace-pre-wrap placeholder:text-base-content/20"
              style={{ width: 'calc(100% - 1.25rem)' }}
              placeholder="Agrega una descripción..."
              ref={(el) => {
                requestAnimationFrame(() => autoResize(el));
              }}
              onInput={(e) => {
                const val = e.currentTarget.value;
                setDescription(val);
                autoResize(e.currentTarget);
                scheduleSave({ description: val });
              }}
            />
          </section>

          {/* Acceptance Criteria */}
          <Show when={criteria().length > 0}>
            <section class="space-y-2.5">
              <div class="flex items-center gap-2">
                <ClipboardCheck size={13} class="text-base-content/25" />
                <h3 class="text-[10px] font-bold uppercase tracking-wider text-base-content/25">
                  Criterios de aceptación
                </h3>
                <span class="text-[10px] text-base-content/20">{metCount()}/{criteria().length}</span>
              </div>
              <div class="ml-5 h-1.5 bg-base-content/5 rounded-full overflow-hidden">
                <div
                  class="h-full bg-ios-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${(metCount() / criteria().length) * 100}%` }}
                />
              </div>
              <div class="space-y-0.5 pl-5">
                <For each={criteria()}>
                  {(c) => (
                    <button
                      class="flex items-start gap-2.5 py-1.5 px-2 -ml-2 rounded-lg w-full text-left hover:bg-base-content/5 active:bg-base-content/10 transition-colors group"
                      onClick={async () => {
                        const newVal = !c.is_met;
                        setCriteriaList(prev =>
                          prev.map(item => item.id === c.id ? { ...item, is_met: newVal } : item)
                        );
                        try {
                          await api.stories.updateCriteria(props.story.id, c.id, { is_met: newVal });
                        } catch {
                          setCriteriaList(prev =>
                            prev.map(item => item.id === c.id ? { ...item, is_met: !newVal } : item)
                          );
                        }
                      }}
                    >
                      <Show
                        when={c.is_met}
                        fallback={<Circle size={15} class="text-base-content/15 mt-0.5 shrink-0 group-hover:text-base-content/30 transition-colors" />}
                      >
                        <CheckCircle size={15} class="text-ios-green-500 mt-0.5 shrink-0" />
                      </Show>
                      <span class={`text-sm leading-snug transition-colors ${c.is_met ? 'text-base-content/30 line-through' : 'text-base-content/70'}`}>
                        {c.text}
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </section>
          </Show>

          {/* Objective — editable */}
          <section class="space-y-1.5">
            <div class="flex items-center gap-2">
              <Target size={13} class="text-base-content/25" />
              <h3 class="text-[10px] font-bold uppercase tracking-wider text-base-content/25">Objetivo</h3>
            </div>
            <textarea
              value={objective()}
              rows={1}
              class="w-full text-sm font-medium bg-transparent resize-none outline-none rounded-lg px-2 py-1 ml-3 border border-transparent focus:border-base-content/10 focus:bg-base-content/[0.02] transition-colors placeholder:text-base-content/20"
              style={{ width: 'calc(100% - 1.25rem)' }}
              placeholder="Define el objetivo..."
              ref={(el) => {
                requestAnimationFrame(() => autoResize(el));
              }}
              onInput={(e) => {
                const val = e.currentTarget.value;
                setObjective(val);
                autoResize(e.currentTarget);
                scheduleSave({ objective: val });
              }}
            />
          </section>

          {/* Delete */}
          <div class="pt-3 mt-3 border-t border-base-content/5">
            <Show when={deleteError()}>
              <p class="text-xs text-red-500 mb-2">{deleteError()}</p>
            </Show>
            <Show
              when={confirming()}
              fallback={
                <button
                  onClick={() => setConfirming(true)}
                  class="flex items-center gap-1.5 text-xs text-base-content/30 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={13} />
                  Eliminar historia
                </button>
              }
            >
              <div class="flex items-center gap-3">
                <span class="text-xs text-red-500">¿Eliminar esta historia?</span>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={deleting()}
                  class="text-xs px-3 py-1.5 rounded-lg bg-base-content/5 text-base-content/50 hover:bg-base-content/10 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting()}
                  class="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  {deleting() ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </Show>
          </div>

        </div>
      </div>
    </div>
  );
};

export default StoryDetail;
