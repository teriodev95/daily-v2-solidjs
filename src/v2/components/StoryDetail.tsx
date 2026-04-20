import { createSignal, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import type { Story, AcceptanceCriteria, User } from '../types';
import { useData } from '../lib/data';
import { api } from '../lib/api';
import {
  X, CheckCircle, Circle, Flame, ArrowUp, ArrowRight, ArrowDown,
  ClipboardCheck, Trash2,
  Check, Loader2, UserPlus, CalendarDays, RefreshCw, FolderKanban, Archive, AlertCircle,
} from 'lucide-solid';
import { frequencyLabel, toLocalDateStr } from '../lib/recurrence';
import AttachmentSection from './AttachmentSection';
import { ContentEditor } from './ContentEditor';
import DatePickerPopover from './DatePickerPopover';
import CopyForAgentButton from './CopyForAgentButton';

const priorityConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  critical: { label: 'Crítica', color: 'text-red-500', bg: 'bg-red-500/10', icon: Flame },
  high: { label: 'Alta', color: 'text-orange-500', bg: 'bg-orange-500/10', icon: ArrowUp },
  medium: { label: 'Media', color: 'text-ios-blue-500', bg: 'bg-ios-blue-500/10', icon: ArrowRight },
  low: { label: 'Baja', color: 'text-base-content/40', bg: 'bg-base-content/5', icon: ArrowDown },
};

const estimates = [
  { value: 1, emoji: '🐝', label: 'Abeja' },
  { value: 2, emoji: '🐭', label: 'Ratón' },
  { value: 3, emoji: '🐦', label: 'Pájaro' },
  { value: 4, emoji: '🐱', label: 'Gato' },
  { value: 5, emoji: '🐶', label: 'Perro' },
  { value: 6, emoji: '🐄', label: 'Vaca' },
  { value: 7, emoji: '🐘', label: 'Elefante' },
  { value: 8, emoji: '🐋', label: 'Ballena' },
];

const getEstimate = (value: number) => estimates.find(e => e.value === value);

const diasCortos = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const getWeekNumber = (d: Date) => {
  const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
};

const getRelativeDateInfo = (type: 'hoy' | 'manana' | 'pasado' | 'semana') => {
  const today = new Date();
  const todayWeek = getWeekNumber(today);

  if (type === 'hoy') {
    const sub = `${diasCortos[today.getDay()]} ${today.getDate()}`;
    return { dateStr: toLocalDateStr(today), label: 'Hoy', sub };
  }

  if (type === 'semana') {
    let d = new Date();
    d.setDate(d.getDate() + 7);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    const sub = `${diasCortos[d.getDay()]} ${d.getDate()}`;
    return { dateStr: toLocalDateStr(d), label: '+1 sem', sub };
  }

  let targetDate = new Date();
  let daysToAdd = type === 'manana' ? 1 : 2;

  while (daysToAdd > 0) {
    targetDate.setDate(targetDate.getDate() + 1);
    if (targetDate.getDay() !== 0) daysToAdd--;
  }

  const dayName = diasSemana[targetDate.getDay()];
  const isNextWeek = getWeekNumber(targetDate) !== todayWeek;
  const sub = isNextWeek ? 'próx.' : 'esta sem';

  return { dateStr: toLocalDateStr(targetDate), label: dayName, sub };
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
  onUpdated?: (storyId: string, fields: Record<string, unknown>) => void;
  zIndex?: number;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const StoryDetail: Component<Props> = (props) => {
  const data = useData();

  // Editable fields
  const [title, setTitle] = createSignal(props.story.title);
  const [content, setContent] = createSignal(props.story.description || '');
  const [dueDate, setDueDate] = createSignal(props.story.due_date || '');
  const [assigneeId, setAssigneeId] = createSignal(props.story.assignee_id || '');
  const [assigneeIds, setAssigneeIds] = createSignal<string[]>([]);
  const [showAssigneePicker, setShowAssigneePicker] = createSignal(false);
  const [estimate, setEstimate] = createSignal(props.story.estimate || 0);
  const [showEstimatePicker, setShowEstimatePicker] = createSignal(false);
  const [showDatePicker, setShowDatePicker] = createSignal(false);
  const [projectId, setProjectId] = createSignal(props.story.project_id || '');
  const [showProjectPicker, setShowProjectPicker] = createSignal(false);
  const [priority, setPriority] = createSignal(props.story.priority || 'medium');
  const [status, setStatus] = createSignal(props.story.status);
  const [showPriorityPicker, setShowPriorityPicker] = createSignal(false);
  const [showStatusPicker, setShowStatusPicker] = createSignal(false);
  let dateTriggerRef!: HTMLButtonElement;
  // Save state
  const [saveStatus, setSaveStatus] = createSignal<SaveStatus>('idle');
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

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
        setSaveStatus('saved');
        props.onUpdated?.(props.story.id, fields);
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    }, 800);
  };

  const saveImmediate = async (fields: Record<string, unknown>) => {
    setSaveStatus('saving');
    try {
      await api.stories.update(props.story.id, fields);
      setSaveStatus('saved');
      props.onUpdated?.(props.story.id, fields);
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  // Attachment paste upload ref
  let attachmentUploadRef: ((file: File) => Promise<void>) | undefined;

  // Fetch story details
  const [criteriaList, setCriteriaList] = createSignal<AcceptanceCriteria[]>([]);
  const [confirming, setConfirming] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [archiving, setArchiving] = createSignal(false);
  const [deleteError, setDeleteError] = createSignal('');
  const [detailLoaded, setDetailLoaded] = createSignal(false);

  onMount(async () => {
    // Lock body scroll while modal is open
    document.body.style.overflow = 'hidden';

    // Paste handler for file uploads
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData?.items) return;
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && attachmentUploadRef) {
            e.preventDefault();
            attachmentUploadRef(file);
          }
          return;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => { document.removeEventListener('paste', handlePaste); document.removeEventListener('keydown', handleKeyDown); });

    try {
      const detail = await api.stories.get(props.story.id);
      setCriteriaList(detail.criteria ?? []);
      setAssigneeIds(detail.assignees ?? []);
      setTitle(detail.title);
      setContent(detail.description || '');
      setDueDate(detail.due_date || '');
      setEstimate(detail.estimate || 0);
      setAssigneeId(detail.assignee_id || '');
      setProjectId((detail as any).project_id || '');
      if (detail.priority) setPriority(detail.priority);
      if (detail.status) setStatus(detail.status);
    } catch { /* story detail is supplementary */ }
    setDetailLoaded(true);
  });

  const project = () => projectId() ? data.getProjectById(projectId()) : null;
  const activeProjects = () => data.projects().filter(p => p.status === 'active');
  const criteria = () => criteriaList();
  const activeMembers = () => data.users().filter(u => u.is_active);

  const currentAssignee = () => assigneeId() ? data.getUserById(assigneeId()) : null;
  const extraAssigneeUsers = () =>
    assigneeIds().map(id => data.getUserById(id)).filter(Boolean) as User[];

  const allAssignedIds = () => {
    const ids = new Set<string>();
    if (assigneeId()) ids.add(assigneeId());
    for (const id of assigneeIds()) ids.add(id);
    return ids;
  };

  const btnHoy = () => getRelativeDateInfo('hoy');
  const btnManana = () => getRelativeDateInfo('manana');
  const btnPasado = () => getRelativeDateInfo('pasado');
  const btnSemana = () => getRelativeDateInfo('semana');

  const prio = () => priorityConfig[priority()] || priorityConfig['medium'];
  const stat = () => statusConfig[status()] || statusConfig['backlog'];
  const metCount = () => criteria().filter(c => c.is_met).length;
  const isRich = () => !!priority();

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

  const canArchive = () =>
    props.story.is_active && props.story.status === 'done' && !props.story.frequency;

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

  const toggleAssignee = async (userId: string) => {
    const assigned = allAssignedIds();

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
        try { await api.stories.removeAssignee(props.story.id, userId); } catch { }
      } else {
        setAssigneeId('');
        await saveImmediate({ assignee_id: null });
      }
      return;
    }

    if (assigned.has(userId)) {
      setAssigneeIds(prev => prev.filter(id => id !== userId));
      try { await api.stories.removeAssignee(props.story.id, userId); } catch { }
    } else {
      setAssigneeIds(prev => [...prev, userId]);
      try { await api.stories.addAssignee(props.story.id, userId); } catch { }
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  return (
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-200"
      style={{ "z-index": props.zIndex ?? 100 }}
      onClick={() => props.onClose()}
    >
      <div
        class="story-detail-modal bg-base-100/95 shadow-[0_-8px_40px_rgba(0,0,0,0.12)] sm:shadow-2xl shadow-black w-full sm:max-w-3xl sm:rounded-[24px] rounded-t-[32px] sm:rounded-t-[24px] mt-auto sm:mt-0 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto overflow-x-hidden border sm:border-base-content/[0.08] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 relative"
        style={{ "-ms-overflow-style": "none", "scrollbar-width": "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Unified property bar */}
        <div class="sticky top-0 bg-base-100/80 backdrop-blur-xl z-20 px-4 sm:px-6 py-3 border-b border-base-content/[0.04]">
          <div class="flex items-center gap-1.5 flex-wrap">

            {/* Project chip */}
            <div class="relative">
              <button
                onClick={() => setShowProjectPicker(v => !v)}
                class={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all ${project()
                  ? 'hover:opacity-80'
                  : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
                }`}
                style={project() ? {
                  "background-color": `${project()!.color}15`,
                  color: project()!.color,
                } : undefined}
              >
                <Show when={project()} fallback={<><FolderKanban size={11} /><span>Proyecto</span></>}>
                  {project()!.name}
                </Show>
              </button>
              <Show when={showProjectPicker()}>
                <div class="fixed inset-0 z-20" onClick={() => setShowProjectPicker(false)} />
                <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-1.5 min-w-[200px] backdrop-blur-md">
                  <button
                    onClick={() => { setProjectId(''); setShowProjectPicker(false); saveImmediate({ project_id: null }); }}
                    class={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all ${!projectId() ? 'bg-base-content/[0.06] text-base-content' : 'hover:bg-base-content/5 text-base-content/50'}`}
                  >
                    <div class="w-5 h-5 rounded-md border border-dashed border-base-content/20 shrink-0" />
                    Sin proyecto
                  </button>
                  <For each={activeProjects()}>
                    {(p) => {
                      const selected = () => projectId() === p.id;
                      return (
                        <button
                          onClick={() => { setProjectId(p.id); setShowProjectPicker(false); saveImmediate({ project_id: p.id }); }}
                          class={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-semibold transition-all ${selected() ? 'bg-base-content/[0.06] text-base-content' : 'hover:bg-base-content/5 text-base-content/70'}`}
                        >
                          <div class="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[8px] font-bold text-white" style={{ "background-color": p.color }}>
                            {p.prefix.slice(0, 2)}
                          </div>
                          <span class="truncate">{p.name}</span>
                          <Show when={selected()}>
                            <Check size={11} class="text-ios-blue-500 ml-auto shrink-0" />
                          </Show>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>

            {/* Status chip (clickable) */}
            <div class="relative">
              <button
                onClick={() => setShowStatusPicker(v => !v)}
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-content/[0.04] hover:bg-base-content/[0.07] transition-all"
              >
                <span class={`w-2 h-2 rounded-full ${stat().color}`} />
                <span class="text-[11px] font-semibold text-base-content/60">{stat().label}</span>
              </button>
              <Show when={showStatusPicker()}>
                <div class="fixed inset-0 z-20" onClick={() => setShowStatusPicker(false)} />
                <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-1.5 min-w-[160px] backdrop-blur-md">
                  <For each={Object.entries(statusConfig)}>
                    {([key, cfg]) => (
                      <button
                        onClick={() => { setStatus(key as any); setShowStatusPicker(false); saveImmediate({ status: key }); props.onUpdated?.(props.story.id, { status: key }); }}
                        class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all ${status() === key ? 'bg-base-content/[0.06] text-base-content' : 'hover:bg-base-content/5 text-base-content/60'}`}
                      >
                        <span class={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
                        {cfg.label}
                        <Show when={status() === key}>
                          <Check size={11} class="text-ios-blue-500 ml-auto" />
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Priority chip (clickable) */}
            <div class="relative">
              <button
                onClick={() => setShowPriorityPicker(v => !v)}
                class={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all ${prio().bg} ${prio().color} hover:opacity-80`}
              >
                {(() => { const PIcon = prio().icon; return <PIcon size={11} strokeWidth={2.5} />; })()}
                {prio().label}
              </button>
              <Show when={showPriorityPicker()}>
                <div class="fixed inset-0 z-20" onClick={() => setShowPriorityPicker(false)} />
                <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-1.5 min-w-[160px] backdrop-blur-md">
                  <For each={Object.entries(priorityConfig)}>
                    {([key, cfg]) => {
                      const Icon = cfg.icon;
                      return (
                        <button
                          onClick={() => { setPriority(key as any); setShowPriorityPicker(false); saveImmediate({ priority: key }); }}
                          class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all ${priority() === key ? `${cfg.bg} ${cfg.color}` : 'hover:bg-base-content/5 text-base-content/60'}`}
                        >
                          <Icon size={13} strokeWidth={2.5} />
                          {cfg.label}
                          <Show when={priority() === key}>
                            <Check size={11} class="text-ios-blue-500 ml-auto" />
                          </Show>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>

            {/* Separator */}
            <div class="w-px h-4 bg-base-content/[0.06] mx-0.5" />

            {/* Date chip */}
            <div class="relative">
              <button
                ref={dateTriggerRef}
                onClick={() => setShowDatePicker(!showDatePicker())}
                class={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  dueDate()
                    ? 'bg-ios-blue-500/10 text-ios-blue-500 hover:bg-ios-blue-500/15'
                    : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.07]'
                }`}
              >
                <CalendarDays size={11} />
                <span>{dueDate() ? formatDateDisplay(dueDate()) : 'Fecha'}</span>
              </button>
              <Show when={showDatePicker()}>
                <div class="fixed inset-0 z-20" onMouseDown={() => setShowDatePicker(false)} />
                <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-3 backdrop-blur-md min-w-[280px]" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  <div class="flex flex-wrap gap-1.5 mb-3">
                    <For each={[btnHoy(), btnManana(), btnPasado(), btnSemana()]}>
                      {(btn) => {
                        const selected = () => dueDate() === btn.dateStr;
                        return (
                          <button
                            onClick={() => { setDueDate(btn.dateStr); saveImmediate({ due_date: btn.dateStr }); setShowDatePicker(false); }}
                            class={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                              selected()
                                ? 'bg-ios-blue-500/15 text-ios-blue-500'
                                : 'bg-base-content/[0.05] text-base-content/50 hover:bg-base-content/[0.1]'
                            }`}
                          >
                            {btn.label} <span class="opacity-50 ml-0.5">{btn.sub}</span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                  <DatePickerPopover
                    value={dueDate()}
                    onSelect={(val) => { setDueDate(val); setShowDatePicker(false); saveImmediate({ due_date: val }); }}
                    onClear={() => { setDueDate(''); setShowDatePicker(false); saveImmediate({ due_date: null }); }}
                    onClose={() => setShowDatePicker(false)}
                    triggerEl={dateTriggerRef}
                  />
                  <Show when={dueDate()}>
                    <button
                      onClick={() => { setDueDate(''); saveImmediate({ due_date: null }); setShowDatePicker(false); }}
                      class="mt-2 text-[10px] font-bold text-base-content/25 hover:text-red-400 transition-colors uppercase tracking-wider"
                    >
                      Quitar fecha
                    </button>
                  </Show>
                </div>
              </Show>
            </div>

            {/* Estimate chip */}
            <div class="relative">
              <button
                onClick={() => setShowEstimatePicker(!showEstimatePicker())}
                class={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  estimate() > 0
                    ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/15'
                    : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.07]'
                }`}
              >
                <Show when={estimate() > 0 && getEstimate(estimate())} fallback={<span>Est.</span>}>
                  {(() => { const e = getEstimate(estimate())!; return <><span>{e.emoji}</span><span>{e.value}</span></>; })()}
                </Show>
              </button>
              <Show when={showEstimatePicker()}>
                <div class="fixed inset-0 z-20" onClick={() => setShowEstimatePicker(false)} />
                <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-2 w-[180px] grid grid-cols-2 gap-1 backdrop-blur-md">
                  <For each={estimates}>
                    {(e) => (
                      <button
                        onClick={() => { setEstimate(e.value); setShowEstimatePicker(false); saveImmediate({ estimate: e.value }); }}
                        class={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                          estimate() === e.value
                            ? 'bg-amber-500/20 text-amber-500 shadow-sm'
                            : 'hover:bg-base-content/5 text-base-content/70 hover:text-base-content'
                        }`}
                      >
                        <span class="text-base">{e.emoji}</span>
                        <span class="font-mono">{e.value}</span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Separator */}
            <div class="w-px h-4 bg-base-content/[0.06] mx-0.5" />

            {/* Assignee chip */}
            <Show when={currentAssignee()}>
              <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-base-content/[0.04]">
                <img src={currentAssignee()!.avatar_url!} alt="" class="w-5 h-5 rounded-full object-cover" title={currentAssignee()!.name} />
                <span class="text-[11px] font-medium text-base-content/60">{currentAssignee()!.name.split(' ')[0]}</span>
              </div>
            </Show>

            {/* Extra assignees */}
            <Show when={extraAssigneeUsers().length > 0}>
              <div class="flex -space-x-1">
                <For each={extraAssigneeUsers()}>
                  {(u) => <img src={u.avatar_url!} alt="" class="w-5 h-5 rounded-full ring-2 ring-base-100 object-cover" title={u.name} />}
                </For>
              </div>
            </Show>

            {/* Add assignee */}
            <button
              onClick={() => setShowAssigneePicker(!showAssigneePicker())}
              class="w-6 h-6 rounded-full flex items-center justify-center text-base-content/30 hover:text-ios-blue-500 hover:bg-ios-blue-500/10 transition-all border border-dashed border-base-content/15 hover:border-ios-blue-500/30"
              title="Asignar"
            >
              <UserPlus size={11} />
            </button>

            {/* Recurring badge */}
            <Show when={props.story.frequency}>
              <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/[0.08] text-purple-500/70">
                <RefreshCw size={10} />
                <span class="text-[10px] font-bold">{frequencyLabel(props.story)}</span>
              </div>
            </Show>

            {/* Spacer + save + share + close */}
            <div class="flex items-center gap-1.5 ml-auto">
              <Show when={saveStatus() !== 'idle'}>
                <span class="flex items-center gap-1">
                  <Show when={saveStatus() === 'saving'}>
                    <Loader2 size={12} class="text-base-content/40 animate-spin" />
                  </Show>
                  <Show when={saveStatus() === 'saved'}>
                    <Check size={12} class="text-ios-green-500" />
                  </Show>
                  <Show when={saveStatus() === 'error'}>
                    <span class="flex items-center gap-1 text-red-500" title="Error al guardar">
                      <AlertCircle size={12} />
                      <span class="text-[9px] font-semibold">Sin guardar</span>
                    </span>
                  </Show>
                </span>
              </Show>
              <CopyForAgentButton
                entity={{
                  type: 'story',
                  id: props.story.id,
                  title: title(),
                }}
              />
              <button onClick={() => props.onClose()} class="p-1.5 rounded-full hover:bg-base-content/10 transition-colors group">
                <X size={18} class="text-base-content/40 group-hover:text-base-content/80 transition-colors" />
              </button>
            </div>
          </div>

          {/* Assignee picker (shown below bar) */}
          <Show when={showAssigneePicker()}>
            <div class="fixed inset-0 z-10" onClick={() => setShowAssigneePicker(false)} />
            <div class="relative z-20 mt-2 rounded-xl border border-base-content/[0.06] bg-base-content/[0.02] p-1 flex flex-wrap gap-0.5">
              <For each={activeMembers()}>
                {(member) => {
                  const isAssigned = () => allAssignedIds().has(member.id);
                  return (
                    <button
                      onClick={() => toggleAssignee(member.id)}
                      class={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        isAssigned()
                          ? 'bg-ios-blue-500/10 text-ios-blue-500'
                          : 'hover:bg-base-content/5 text-base-content/50'
                      }`}
                    >
                      <img src={member.avatar_url!} alt="" class="w-5 h-5 rounded-full" />
                      <span class="font-medium">{member.name.split(' ')[0]}</span>
                      <Show when={isAssigned()}>
                        <Check size={11} class="text-ios-blue-500" />
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>

        <div class="px-5 sm:px-8 py-5 sm:py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:pb-8 space-y-4 sm:space-y-5">

          {/* Title */}
          <div class="overflow-hidden">
            <textarea
              value={title()}
              rows={1}
              class="w-full text-xl sm:text-[26px] font-extrabold leading-tight text-base-content bg-transparent resize-none outline-none overflow-hidden px-1 py-1 placeholder:text-base-content/20"
              placeholder="Título de la historia"
              ref={(el) => { requestAnimationFrame(() => autoResize(el)); }}
              onInput={(e) => {
                const val = e.currentTarget.value;
                setTitle(val);
                autoResize(e.currentTarget);
                if (val.trim()) scheduleSave({ title: val });
              }}
            />
          </div>

          {/* Content canvas */}
          <ContentEditor
            content={content()}
            placeholder="Escribe aquí — **negrita**, _cursiva_, - listas, # títulos, `código`"
            onChange={(md) => {
              scheduleSave({ description: md });
            }}
          />

          {/* Acceptance Criteria */}
          <Show when={criteria().length > 0}>
            <section class="space-y-4 pt-2">
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-2 text-base-content/40">
                  <ClipboardCheck size={14} />
                  <h3 class="text-[11px] font-bold uppercase tracking-[0.1em]">
                    Criterios <span class="text-base-content/30 ml-1">{metCount()}/{criteria().length}</span>
                  </h3>
                </div>
                <div class="flex-1 h-1.5 bg-base-content/[0.04] rounded-full overflow-hidden ml-2 relative">
                  <div
                    class="absolute left-0 top-0 h-full bg-ios-green-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(metCount() / criteria().length) * 100}%` }}
                  />
                </div>
              </div>
              <div class="space-y-1.5">
                <For each={criteria()}>
                  {(c) => (
                    <button
                      class="flex items-start gap-3 py-2 px-3 -ml-3 rounded-xl w-full text-left hover:bg-base-content/[0.03] active:bg-base-content/[0.05] transition-all group"
                      onClick={async () => {
                        const newVal = !c.is_met;
                        setCriteriaList(prev => prev.map(item => item.id === c.id ? { ...item, is_met: newVal } : item));
                        try { await api.stories.updateCriteria(props.story.id, c.id, { is_met: newVal }); }
                        catch { setCriteriaList(prev => prev.map(item => item.id === c.id ? { ...item, is_met: !newVal } : item)); }
                      }}
                    >
                      <Show
                        when={c.is_met}
                        fallback={<Circle size={18} class="text-base-content/15 mt-0.5 shrink-0 group-hover:text-base-content/40 transition-colors" strokeWidth={2} />}
                      >
                        <CheckCircle size={18} class="text-ios-green-500 mt-0.5 shrink-0" strokeWidth={2.5} />
                      </Show>
                      <span class={`text-[15px] sm:text-[14px] leading-relaxed transition-colors duration-300 font-medium ${c.is_met ? 'text-base-content/40 line-through decoration-base-content/30' : 'text-base-content/80 group-hover:text-base-content'}`}>
                        {c.text}
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </section>
          </Show>

          {/* Attachments — only load after detail fetch to prevent flicker */}
          <Show when={detailLoaded()}>
            <div class="pt-2">
              <AttachmentSection
                storyId={props.story.id}
                onReady={(fn) => { attachmentUploadRef = fn; }}
              />
            </div>
          </Show>

          {/* Delete */}
          <div class="pt-6 mt-4 border-t border-base-content/[0.04]">
            <Show when={canArchive()}>
              <div class="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-base-content/[0.06] bg-base-content/[0.02] px-4 py-3">
                <div class="min-w-0">
                  <p class="text-[12px] font-semibold text-base-content/70">Ocultar del reporte y tableros</p>
                  <p class="text-[11px] text-base-content/40">La tarea se conserva en base de datos, pero deja de aparecer en la app.</p>
                </div>
                <button
                  onClick={handleArchive}
                  disabled={archiving()}
                  class="flex items-center gap-2 rounded-xl bg-base-content/[0.06] px-3 py-2 text-[12px] font-semibold text-base-content/70 transition-all hover:bg-base-content/[0.1] hover:text-base-content disabled:opacity-50"
                >
                  <Archive size={14} />
                  {archiving() ? 'Ocultando...' : 'Ocultar'}
                </button>
              </div>
            </Show>
            <Show when={deleteError()}>
              <p class="text-[13px] text-red-500 font-medium mb-3">{deleteError()}</p>
            </Show>
            <Show
              when={confirming()}
              fallback={
                <button
                  onClick={() => setConfirming(true)}
                  class="flex items-center gap-2 text-[12px] font-semibold text-base-content/30 hover:text-red-500 hover:bg-red-500/10 px-3 py-1.5 -ml-3 rounded-lg transition-all"
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
              }
            >
              <div class="flex items-center gap-3">
                <span class="text-[12px] font-medium text-red-500">¿Estás seguro de eliminar?</span>
                <button onClick={() => setConfirming(false)} disabled={deleting()}
                  class="text-[12px] font-medium px-4 py-2 rounded-xl bg-base-content/[0.04] text-base-content/60 hover:bg-base-content/10 hover:text-base-content transition-all">
                  Cancelar
                </button>
                <button onClick={handleDelete} disabled={deleting()}
                  class="text-[12px] font-medium px-4 py-2 rounded-xl bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-all disabled:opacity-50">
                  {deleting() ? 'Eliminando...' : 'Sí, eliminar'}
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
