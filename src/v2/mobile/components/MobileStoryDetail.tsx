import { createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import type { AcceptanceCriteria, Story, User } from '../../types';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { api } from '../../lib/api';
import {
  Archive,
  CalendarDays,
  Check,
  CheckCircle,
  Circle,
  ClipboardCheck,
  FolderKanban,
  Loader2,
  RefreshCw,
  Target,
  Trash2,
  UserCircle2,
  X,
} from 'lucide-solid';
import { frequencyLabel, toLocalDateStr } from '../../lib/recurrence';
import AttachmentSection from '../../components/AttachmentSection';
import { ContentEditor } from '../../components/ContentEditor';

interface MobileStoryDetailProps {
  story: Story;
  onClose: () => void;
  onDeleted?: () => void;
  onUpdated?: (storyId: string, fields: Record<string, unknown>) => void;
  zIndex?: number;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

const estimates = [
  { value: 1, emoji: '🐝' },
  { value: 2, emoji: '🐭' },
  { value: 3, emoji: '🐦' },
  { value: 4, emoji: '🐱' },
  { value: 5, emoji: '🐶' },
  { value: 6, emoji: '🐄' },
  { value: 7, emoji: '🐘' },
  { value: 8, emoji: '🐋' },
];

const statusOptions = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Por hacer' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'done', label: 'Hecho' },
];

const MobileStoryDetail: Component<MobileStoryDetailProps> = (props) => {
  const auth = useAuth();
  const data = useData();

  const [title, setTitle] = createSignal(props.story.title);
  const buildContent = () => {
    const p = (props.story.purpose || '').trim();
    const d = (props.story.description || '').trim();
    const o = (props.story.objective || '').trim();
    if (!p && !o) return d;
    const parts: string[] = [];
    if (p) parts.push(`## Para qué\n${p}`);
    if (d) parts.push(d);
    if (o) parts.push(`## Objetivo\n${o}`);
    return parts.join('\n\n');
  };
  const [content, setContent] = createSignal(buildContent());
  const [dueDate, setDueDate] = createSignal(props.story.due_date || '');
  const [status, setStatus] = createSignal(props.story.status);
  const [projectId, setProjectId] = createSignal(props.story.project_id || '');
  const [assigneeId, setAssigneeId] = createSignal(props.story.assignee_id || '');
  const [assigneeIds, setAssigneeIds] = createSignal<string[]>([]);
  const [estimate, setEstimate] = createSignal(props.story.estimate || 0);
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>('idle');
  const [criteriaList, setCriteriaList] = createSignal<AcceptanceCriteria[]>([]);
  const [detailLoaded, setDetailLoaded] = createSignal(false);
  const [confirming, setConfirming] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [archiving, setArchiving] = createSignal(false);
  const [deleteError, setDeleteError] = createSignal('');

  let dateInputRef!: HTMLInputElement;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  let attachmentUploadRef: ((file: File) => Promise<void>) | undefined;

  onCleanup(() => {
    clearTimeout(debounceTimer);
    clearTimeout(savedTimer);
    document.body.style.overflow = '';
  });

  const scheduleSave = (fields: Record<string, unknown>) => {
    clearTimeout(debounceTimer);
    setSaveStatus('idle');
    debounceTimer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await api.stories.update(props.story.id, fields);
        props.onUpdated?.(props.story.id, fields);
        setSaveStatus('saved');
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => setSaveStatus('idle'), 1500);
      } catch {
        setSaveStatus('idle');
      }
    }, 600);
  };

  const saveImmediate = async (fields: Record<string, unknown>) => {
    setSaveStatus('saving');
    try {
      await api.stories.update(props.story.id, fields);
      props.onUpdated?.(props.story.id, fields);
      setSaveStatus('saved');
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => setSaveStatus('idle'), 1500);
    } catch {
      setSaveStatus('idle');
    }
  };

  onMount(async () => {
    document.body.style.overflow = 'hidden';

    const handlePaste = (event: ClipboardEvent) => {
      if (!event.clipboardData?.items) return;
      for (const item of Array.from(event.clipboardData.items)) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (file && attachmentUploadRef) {
          event.preventDefault();
          attachmentUploadRef(file);
        }
        return;
      }
    };

    document.addEventListener('paste', handlePaste);
    onCleanup(() => document.removeEventListener('paste', handlePaste));

    try {
      const detail = await api.stories.get(props.story.id);
      setTitle(detail.title);
      setDueDate(detail.due_date || '');
      setStatus(detail.status);
      setEstimate(detail.estimate || 0);
      setAssigneeId(detail.assignee_id || '');
      setAssigneeIds(detail.assignees ?? []);
      setProjectId((detail as Story).project_id || '');
      setCriteriaList(detail.criteria ?? []);
      // Rebuild content canvas from fetched detail
      {
        const p = (detail.purpose || '').trim();
        const d = (detail.description || '').trim();
        const o = (detail.objective || '').trim();
        if (!p && !o) { setContent(d); }
        else {
          const parts: string[] = [];
          if (p) parts.push(`## Para qué\n${p}`);
          if (d) parts.push(d);
          if (o) parts.push(`## Objetivo\n${o}`);
          setContent(parts.join('\n\n'));
        }
      }
    } catch {
      // Detail fetch is additive.
    }
    setDetailLoaded(true);
  });

  const activeProjects = () => data.projects().filter((project) => project.status === 'active');
  const activeMembers = () => data.users().filter((user) => user.is_active);
  const project = () => projectId() ? data.getProjectById(projectId()) : null;
  const currentAssignee = () => assigneeId() ? data.getUserById(assigneeId()) : null;
  const extraAssigneeUsers = () => assigneeIds().map((id) => data.getUserById(id)).filter(Boolean) as User[];
  const assignedIds = () => {
    const ids = new Set<string>();
    if (assigneeId()) ids.add(assigneeId());
    for (const id of assigneeIds()) ids.add(id);
    return ids;
  };
  const canArchive = () => props.story.is_active && status() === 'done' && !props.story.frequency;
  const datePresets = () => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    return [
      { label: 'Hoy', value: toLocalDateStr(today) },
      { label: 'Mañana', value: toLocalDateStr(tomorrow) },
      { label: '+1 sem', value: toLocalDateStr(nextWeek) },
    ];
  };

  const autoResize = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  };

  const formatDateLabel = (value: string) => {
    if (!value) return 'Sin fecha';
    const today = toLocalDateStr(new Date());
    if (value === today) return 'Hoy';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (value === toLocalDateStr(tomorrow)) return 'Mañana';
    return new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  const initials = (name: string) =>
    name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0] || '')
      .join('')
      .toUpperCase();

  const toggleAssignee = async (userId: string) => {
    const currentIds = assignedIds();
    if (!assigneeId()) {
      setAssigneeId(userId);
      await saveImmediate({ assignee_id: userId });
      return;
    }

    if (userId === assigneeId()) {
      const extras = assigneeIds();
      if (extras.length > 0) {
        const newPrimary = extras[0];
        const newExtras = extras.slice(1);
        setAssigneeId(newPrimary);
        setAssigneeIds(newExtras);
        await saveImmediate({ assignee_id: newPrimary });
        try {
          await api.stories.removeAssignee(props.story.id, userId);
        } catch {}
      } else {
        setAssigneeId('');
        await saveImmediate({ assignee_id: null });
      }
      return;
    }

    if (currentIds.has(userId)) {
      setAssigneeIds((prev) => prev.filter((id) => id !== userId));
      try {
        await api.stories.removeAssignee(props.story.id, userId);
      } catch {}
    } else {
      setAssigneeIds((prev) => [...prev, userId]);
      try {
        await api.stories.addAssignee(props.story.id, userId);
      } catch {}
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.stories.delete(props.story.id);
      props.onDeleted?.();
      props.onClose();
    } catch (error: any) {
      setDeleteError(error?.message || 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await api.stories.update(props.story.id, { is_active: false });
      props.onUpdated?.(props.story.id, { is_active: false });
      props.onClose();
    } finally {
      setArchiving(false);
    }
  };

  const updateStatus = (nextStatus: Story['status']) => {
    setStatus(nextStatus);
    saveImmediate({
      status: nextStatus,
      completed_at: nextStatus === 'done' ? new Date().toISOString() : null,
    });
  };

  return (
    <div
      class="fixed inset-0 bg-black/72 backdrop-blur-xl sm:hidden"
      style={{ 'z-index': props.zIndex ?? 210 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div class="absolute inset-x-0 bottom-0 top-[max(1rem,env(safe-area-inset-top))] overflow-hidden rounded-t-[32px] border border-base-content/[0.08] bg-[linear-gradient(180deg,rgba(18,18,20,0.98),rgba(8,8,10,0.99))] shadow-[0_-32px_90px_rgba(0,0,0,0.48)]">
        <div class="flex h-full flex-col">
          <div class="sticky top-0 z-20 border-b border-base-content/[0.06] bg-base-100/85 px-4 pt-4 pb-3 backdrop-blur-xl">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1 space-y-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => dateInputRef?.showPicker?.()}
                    class="inline-flex items-center gap-1.5 rounded-full bg-base-content/[0.05] px-3 py-1.5 text-[11px] font-semibold text-base-content/65"
                  >
                    <CalendarDays size={12} />
                    {formatDateLabel(dueDate())}
                  </button>
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-base-content/[0.05] px-3 py-1.5 text-[11px] font-semibold text-base-content/65">
                    <span class={`h-2 w-2 rounded-full ${
                      status() === 'done'
                        ? 'bg-ios-green-500'
                        : status() === 'in_progress'
                          ? 'bg-amber-500'
                          : status() === 'todo'
                            ? 'bg-ios-blue-500'
                            : 'bg-base-content/25'
                    }`} />
                    {statusOptions.find((item) => item.value === status())?.label ?? 'Estado'}
                  </span>
                  <Show when={project()}>
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                      style={{ 'background-color': `${project()!.color}18`, color: project()!.color }}
                    >
                      <FolderKanban size={12} />
                      {project()!.prefix}
                    </span>
                  </Show>
                </div>

                <Show when={saveStatus() !== 'idle'}>
                  <div class="inline-flex items-center gap-1.5 rounded-full bg-base-content/[0.04] px-2.5 py-1 text-[10px] font-semibold text-base-content/40">
                    <Show when={saveStatus() === 'saving'} fallback={<Check size={11} class="text-ios-green-500" />}>
                      <Loader2 size={11} class="animate-spin" />
                    </Show>
                    {saveStatus() === 'saving' ? 'Guardando' : 'Guardado'}
                  </div>
                </Show>
              </div>

              <button
                onClick={props.onClose}
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-base-content/[0.04] text-base-content/40"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto px-4 py-4 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-5">
            <textarea
              value={title()}
              rows={1}
              class="w-full resize-none bg-transparent text-[29px] font-semibold leading-[1.05] tracking-tight text-base-content/92 outline-none placeholder:text-base-content/20"
              placeholder="Nueva tarea"
              ref={(element) => requestAnimationFrame(() => autoResize(element))}
              onInput={(event) => {
                setTitle(event.currentTarget.value);
                autoResize(event.currentTarget);
                if (event.currentTarget.value.trim()) scheduleSave({ title: event.currentTarget.value });
              }}
            />

            <Show when={props.story.frequency}>
              <div class="inline-flex items-center gap-2 rounded-2xl border border-purple-500/18 bg-purple-500/10 px-3 py-2 text-[12px] font-semibold text-purple-400">
                <RefreshCw size={13} />
                {frequencyLabel(props.story)}
              </div>
            </Show>

            <section class="grid grid-cols-2 gap-3">
              <button
                onClick={async () => {
                  const currentId = auth.user()?.id || '';
                  setAssigneeId(currentId);
                  await saveImmediate({ assignee_id: currentId || null });
                }}
                class={`rounded-[24px] border px-4 py-3 text-left transition-all ${
                  assigneeId() === auth.user()?.id
                    ? 'border-ios-blue-500/25 bg-ios-blue-500/12 text-ios-blue-400'
                    : 'border-base-content/[0.06] bg-base-content/[0.03] text-base-content/70'
                }`}
              >
                <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/25">Asignación</p>
                <p class="mt-2 text-[15px] font-semibold">Asignarme</p>
                <p class="mt-1 text-[11px] text-base-content/35">{auth.user()?.name.split(' ')[0] ?? 'Yo'}</p>
              </button>

              <div class="rounded-[24px] border border-base-content/[0.06] bg-base-content/[0.03] px-4 py-3">
                <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/25">Estimación</p>
                <div class="mt-2 flex items-center gap-2">
                  <span class="text-[22px]">{estimates.find((item) => item.value === estimate())?.emoji ?? '•'}</span>
                  <span class="text-[15px] font-semibold text-base-content/85">
                    {estimate() > 0 ? `${estimate()} pts` : 'Sin estimar'}
                  </span>
                </div>
              </div>
            </section>

            <section class="space-y-3 rounded-[28px] border border-base-content/[0.07] bg-base-content/[0.03] p-4">
              <div class="flex items-center gap-2 text-base-content/45">
                <CalendarDays size={14} />
                <h3 class="text-[11px] font-bold uppercase tracking-[0.12em]">Fecha límite</h3>
              </div>
              <div class="grid grid-cols-4 gap-2">
                <For each={datePresets()}>
                  {(option) => (
                    <button
                      onClick={() => {
                        setDueDate(option.value);
                        saveImmediate({ due_date: option.value });
                      }}
                      class={`rounded-2xl px-2 py-2.5 text-[11px] font-semibold transition-all ${
                        dueDate() === option.value
                          ? 'bg-ios-blue-500/14 text-ios-blue-400 ring-1 ring-ios-blue-500/30'
                          : 'bg-base-content/[0.04] text-base-content/55'
                      }`}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
                <button
                  onClick={() => dateInputRef?.showPicker?.()}
                  class={`rounded-2xl px-2 py-2.5 text-[11px] font-semibold transition-all ${
                    dueDate() && !datePresets().some((option) => option.value === dueDate())
                      ? 'bg-ios-blue-500/14 text-ios-blue-400 ring-1 ring-ios-blue-500/30'
                      : 'bg-base-content/[0.04] text-base-content/55'
                  }`}
                >
                  {dueDate() && !datePresets().some((option) => option.value === dueDate()) ? formatDateLabel(dueDate()) : 'Otra'}
                </button>
              </div>
              <div class="flex items-center justify-between gap-3">
                <p class="text-[11px] text-base-content/30">Fecha actual: {formatDateLabel(dueDate())}</p>
                <Show when={dueDate()}>
                  <button
                    onClick={() => {
                      setDueDate('');
                      saveImmediate({ due_date: null });
                    }}
                    class="text-[11px] font-semibold text-base-content/45"
                  >
                    Quitar fecha
                  </button>
                </Show>
              </div>
              <input
                ref={dateInputRef}
                type="date"
                class="sr-only"
                onChange={(event) => {
                  if (!event.currentTarget.value) return;
                  setDueDate(event.currentTarget.value);
                  saveImmediate({ due_date: event.currentTarget.value });
                }}
              />
            </section>

            <section class="space-y-3 rounded-[28px] border border-base-content/[0.07] bg-base-content/[0.03] p-4">
              <div class="flex items-center gap-2 text-base-content/45">
                <FolderKanban size={14} />
                <h3 class="text-[11px] font-bold uppercase tracking-[0.12em]">Proyecto</h3>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setProjectId('');
                    saveImmediate({ project_id: null });
                  }}
                  class={`rounded-2xl border px-3 py-3 text-left text-[12px] font-semibold transition-all ${
                    !projectId()
                      ? 'border-base-content/[0.16] bg-base-content/[0.08] text-base-content/90'
                      : 'border-base-content/[0.06] bg-base-content/[0.03] text-base-content/50'
                  }`}
                >
                  Sin proyecto
                </button>
                <For each={activeProjects()}>
                  {(item) => (
                    <button
                      onClick={() => {
                        setProjectId(item.id);
                        saveImmediate({ project_id: item.id });
                      }}
                      class={`rounded-2xl border px-3 py-3 text-left transition-all ${
                        projectId() === item.id
                          ? 'border-transparent shadow-sm'
                          : 'border-base-content/[0.06] bg-base-content/[0.03]'
                      }`}
                      style={projectId() === item.id ? {
                        'background-color': `${item.color}18`,
                        color: item.color,
                        'box-shadow': `inset 0 0 0 1px ${item.color}33`,
                      } : undefined}
                    >
                      <div class="flex items-center gap-2">
                        <div class="h-2.5 w-2.5 rounded-full" style={{ 'background-color': item.color }} />
                        <span class="truncate text-[12px] font-bold">{item.prefix}</span>
                      </div>
                      <p class="mt-1 truncate text-[10px] opacity-70">{item.name}</p>
                    </button>
                  )}
                </For>
              </div>
            </section>

            <section class="space-y-3 rounded-[28px] border border-base-content/[0.07] bg-base-content/[0.03] p-4">
              <div class="flex items-center gap-2 text-base-content/45">
                <UserCircle2 size={14} />
                <h3 class="text-[11px] font-bold uppercase tracking-[0.12em]">Personas</h3>
              </div>
              <div class="flex flex-wrap gap-2">
                <Show when={currentAssignee()}>
                  <div class="inline-flex items-center gap-2 rounded-full bg-base-content/[0.06] px-3 py-2 text-[11px] font-semibold text-base-content/80">
                    <span class="text-base-content/30">Encargado</span>
                    <span>{currentAssignee()!.name.split(' ')[0]}</span>
                  </div>
                </Show>
                <For each={extraAssigneeUsers()}>
                  {(user) => (
                    <div class="inline-flex items-center gap-2 rounded-full bg-base-content/[0.04] px-3 py-2 text-[11px] font-semibold text-base-content/55">
                      <span>+ {user.name.split(' ')[0]}</span>
                    </div>
                  )}
                </For>
              </div>
              <div class="grid grid-cols-4 gap-2">
                <For each={activeMembers()}>
                  {(member) => {
                    const selected = () => assignedIds().has(member.id);
                    return (
                      <button
                        onClick={() => toggleAssignee(member.id)}
                        class="min-w-0 rounded-2xl px-1 py-2 transition-all"
                      >
                        <Show
                          when={member.avatar_url}
                          fallback={
                            <div class={`mx-auto flex h-11 w-11 items-center justify-center rounded-full text-[10px] font-bold uppercase ${
                              selected()
                                ? 'bg-ios-blue-500/14 text-ios-blue-400 ring-2 ring-ios-blue-500/35'
                                : 'bg-base-content/10 text-base-content/45 ring-1 ring-base-content/[0.06]'
                            }`}>
                              {initials(member.name)}
                            </div>
                          }
                        >
                          <img
                            src={member.avatar_url!}
                            alt=""
                            class={`mx-auto h-11 w-11 rounded-full object-cover ${
                              selected() ? 'ring-2 ring-ios-blue-500/40' : 'ring-1 ring-base-content/[0.08]'
                            }`}
                          />
                        </Show>
                        <p class={`mt-2 truncate text-center text-[10px] font-semibold ${selected() ? 'text-ios-blue-400' : 'text-base-content/35'}`}>
                          {member.id === auth.user()?.id ? 'Yo' : member.name.split(' ')[0]}
                        </p>
                      </button>
                    );
                  }}
                </For>
              </div>
            </section>

            <section class="space-y-3 rounded-[28px] border border-base-content/[0.07] bg-base-content/[0.03] p-4">
              <div class="flex items-center gap-2 text-base-content/45">
                <Target size={14} />
                <h3 class="text-[11px] font-bold uppercase tracking-[0.12em]">Estado y tamaño</h3>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <For each={statusOptions}>
                  {(option) => (
                    <button
                      onClick={() => updateStatus(option.value as Story['status'])}
                      class={`rounded-2xl px-3 py-3 text-left text-[12px] font-semibold transition-all ${
                        status() === option.value
                          ? 'bg-base-content/[0.10] text-base-content/92'
                          : 'bg-base-content/[0.04] text-base-content/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
              </div>
              <div class="grid grid-cols-4 gap-2">
                <For each={estimates}>
                  {(item) => (
                    <button
                      onClick={() => {
                        setEstimate(item.value);
                        saveImmediate({ estimate: item.value });
                      }}
                      class={`rounded-2xl px-2 py-2.5 text-center text-[11px] font-semibold transition-all ${
                        estimate() === item.value
                          ? 'bg-amber-500/14 text-amber-400 ring-1 ring-amber-500/30'
                          : 'bg-base-content/[0.04] text-base-content/50'
                      }`}
                    >
                      <span class="block text-base">{item.emoji}</span>
                      <span>{item.value}</span>
                    </button>
                  )}
                </For>
              </div>
            </section>

            {/* Content canvas */}
            <ContentEditor
              content={content()}
              placeholder="Escribe aquí — **negrita**, _cursiva_, - listas, # títulos, `código`"
              onChange={(md) => {
                setContent(md);
                scheduleSave({ description: md, purpose: '', objective: '' });
              }}
              class="px-1"
            />

            <Show when={criteriaList().length > 0}>
              <section class="space-y-3 rounded-[28px] border border-base-content/[0.07] bg-base-content/[0.03] p-4">
                <div class="flex items-center gap-2 text-base-content/45">
                  <ClipboardCheck size={14} />
                  <h3 class="text-[11px] font-bold uppercase tracking-[0.12em]">
                    Criterios {criteriaList().filter((item) => item.is_met).length}/{criteriaList().length}
                  </h3>
                </div>
                <div class="space-y-2">
                  <For each={criteriaList()}>
                    {(criterion) => (
                      <button
                        class="flex w-full items-start gap-3 rounded-2xl bg-base-content/[0.03] px-3 py-3 text-left"
                        onClick={async () => {
                          const next = !criterion.is_met;
                          setCriteriaList((prev) => prev.map((item) => item.id === criterion.id ? { ...item, is_met: next } : item));
                          try {
                            await api.stories.updateCriteria(props.story.id, criterion.id, { is_met: next });
                          } catch {
                            setCriteriaList((prev) => prev.map((item) => item.id === criterion.id ? { ...item, is_met: !next } : item));
                          }
                        }}
                      >
                        <Show
                          when={criterion.is_met}
                          fallback={<Circle size={18} class="mt-0.5 shrink-0 text-base-content/20" strokeWidth={2} />}
                        >
                          <CheckCircle size={18} class="mt-0.5 shrink-0 text-ios-green-500" strokeWidth={2.5} />
                        </Show>
                        <span class={`text-[14px] leading-6 ${criterion.is_met ? 'text-base-content/40 line-through' : 'text-base-content/82'}`}>
                          {criterion.text}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={detailLoaded()}>
              <AttachmentSection
                storyId={props.story.id}
                onReady={(handler) => {
                  attachmentUploadRef = handler;
                }}
              />
            </Show>

            <section class="space-y-3 rounded-[28px] border border-base-content/[0.07] bg-base-content/[0.03] p-4">
              <Show when={canArchive()}>
                <button
                  onClick={handleArchive}
                  disabled={archiving()}
                  class="flex w-full items-center justify-between rounded-2xl bg-base-content/[0.05] px-4 py-3 text-left"
                >
                  <div>
                    <p class="text-[13px] font-semibold text-base-content/78">Ocultar del reporte y tableros</p>
                    <p class="mt-1 text-[11px] text-base-content/35">La tarea permanece en base de datos.</p>
                  </div>
                  <span class="inline-flex items-center gap-2 text-[12px] font-semibold text-base-content/55">
                    <Archive size={14} />
                    {archiving() ? 'Ocultando' : 'Ocultar'}
                  </span>
                </button>
              </Show>

              <Show when={deleteError()}>
                <p class="text-[12px] font-medium text-red-500">{deleteError()}</p>
              </Show>

              <Show
                when={confirming()}
                fallback={
                  <button
                    onClick={() => setConfirming(true)}
                    class="flex items-center gap-2 text-[12px] font-semibold text-red-400"
                  >
                    <Trash2 size={14} />
                    Eliminar tarea
                  </button>
                }
              >
                <div class="rounded-2xl border border-red-500/20 bg-red-500/8 p-4">
                  <p class="text-[13px] font-semibold text-red-400">¿Eliminar definitivamente?</p>
                  <div class="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setConfirming(false)}
                      class="rounded-2xl bg-base-content/[0.06] px-4 py-3 text-[12px] font-semibold text-base-content/65"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting()}
                      class="rounded-2xl bg-red-500 px-4 py-3 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      {deleting() ? 'Eliminando...' : 'Sí, eliminar'}
                    </button>
                  </div>
                </div>
              </Show>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileStoryDetail;
