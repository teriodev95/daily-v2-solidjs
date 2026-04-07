import { createSignal, For, Show, onMount, onCleanup, type Component } from 'solid-js';
import type { Priority, StoryStatus, ReportCategory } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { toLocalDateStr } from '../lib/recurrence';
import {
  X, Check,
  Flame, ArrowUp, ArrowRight, ArrowDown,
  Calendar, UserPlus, Braces, ClipboardPaste,
  ClipboardCheck, AlertCircle, Trash2, Sparkles,
  Paperclip, ImagePlus, FileIcon, Loader2,
} from 'lucide-solid';
import DatePickerPopover from './DatePickerPopover';

interface Props {
  onClose: () => void;
  onCreated?: () => void;
  defaultCategory?: ReportCategory;
  defaultProjectId?: string;
}

const priorityOptions: { id: Priority; label: string; color: string; bg: string; selectedBg: string; icon: any }[] = [
  { id: 'low', label: 'Baja', color: 'text-base-content/50', bg: 'bg-base-content/[0.02] border border-transparent hover:bg-base-content/[0.05]', selectedBg: 'bg-base-content/[0.04] border border-base-content/20 shadow-sm text-base-content/90', icon: ArrowDown },
  { id: 'medium', label: 'Media', color: 'text-ios-blue-500', bg: 'bg-base-content/[0.02] border border-transparent hover:bg-base-content/[0.05]', selectedBg: 'bg-ios-blue-500/10 border border-ios-blue-500/20 shadow-sm text-ios-blue-500', icon: ArrowRight },
  { id: 'high', label: 'Alta', color: 'text-orange-500', bg: 'bg-base-content/[0.02] border border-transparent hover:bg-base-content/[0.05]', selectedBg: 'bg-orange-500/10 border border-orange-500/20 shadow-sm text-orange-500', icon: ArrowUp },
  { id: 'critical', label: 'Crítica', color: 'text-red-500', bg: 'bg-base-content/[0.02] border border-transparent hover:bg-base-content/[0.05]', selectedBg: 'bg-red-500/10 border border-red-500/20 shadow-sm text-red-500', icon: Flame },
];

const statusOptions: { id: StoryStatus; label: string; dot: string }[] = [
  { id: 'backlog', label: 'Backlog', dot: 'bg-base-content/25' },
  { id: 'todo', label: 'Por hacer', dot: 'bg-ios-blue-500' },
  { id: 'in_progress', label: 'En progreso', dot: 'bg-amber-500' },
  { id: 'done', label: 'Hecho', dot: 'bg-ios-green-500' },
];

const fibonacciPoints = [1, 2, 3, 5, 8, 13];

const categoryToStatus: Record<ReportCategory, StoryStatus> = {
  yesterday: 'done',
  today: 'in_progress',
  backlog: 'backlog',
};

// Exact fields used to detect a story JSON
const STORY_FIELDS = ['title', 'description', 'purpose', 'objective'];

/** Find the criteria array from any key starting with "acceptance" or "criteria" */
function findCriteria(obj: Record<string, any>): any[] {
  for (const key of Object.keys(obj)) {
    const k = key.toLowerCase();
    if ((k.startsWith('acceptance') || k.startsWith('criteria')) && Array.isArray(obj[key])) {
      return obj[key];
    }
  }
  return [];
}

/** Returns parsed object if text is valid story JSON, null otherwise */
function parseStoryJson(text: string): Record<string, any> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
    const hasStoryField = STORY_FIELDS.some(k => k in obj && obj[k]);
    const hasCriteria = findCriteria(obj).length > 0;
    return (hasStoryField || hasCriteria) ? obj : null;
  } catch {
    return null;
  }
}

interface QueuedFile {
  id: string;
  file: File;
  previewUrl: string | null;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const isImageType = (type: string) => type.startsWith('image/');
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const CreateStoryModal: Component<Props> = (props) => {
  const auth = useAuth();
  const data = useData();

  const defaultStatus = props.defaultCategory ? categoryToStatus[props.defaultCategory] : 'todo';

  // ─── Form state ───
  const [title, setTitle] = createSignal('');
  const [projectId, setProjectId] = createSignal<string | null>(props.defaultProjectId ?? null);
  const [priority, setPriority] = createSignal<Priority>('medium');
  const [assigneeId, setAssigneeId] = createSignal<string | null>(auth.user()?.id ?? null);
  const [involucrados, setInvolucrados] = createSignal<Set<string>>(new Set());
  const [status, setStatus] = createSignal<StoryStatus>(defaultStatus);
  const [description, setDescription] = createSignal('');
  const [estimate, setEstimate] = createSignal<number>(0);
  const [dueDate, setDueDate] = createSignal('');
  const [showDatePicker, setShowDatePicker] = createSignal(false);
  let dateTriggerRef!: HTMLButtonElement;

  // ─── Picker toggles ───
  const [showProjectPicker, setShowProjectPicker] = createSignal(false);
  const [showPriorityPicker, setShowPriorityPicker] = createSignal(false);
  const [showStatusPicker, setShowStatusPicker] = createSignal(false);
  const [showEstimatePicker, setShowEstimatePicker] = createSignal(false);
  const [showAssigneePicker, setShowAssigneePicker] = createSignal(false);
  const [showInvolucradosPicker, setShowInvolucradosPicker] = createSignal(false);

  // ─── Queued files (uploaded after story creation) ───
  const [queuedFiles, setQueuedFiles] = createSignal<QueuedFile[]>([]);
  const [dragOver, setDragOver] = createSignal(false);
  const [uploadingFiles, setUploadingFiles] = createSignal(false);
  let fileInput!: HTMLInputElement;

  const queueFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) return;
    const previewUrl = isImageType(file.type) ? URL.createObjectURL(file) : null;
    setQueuedFiles(prev => [...prev, { id: crypto.randomUUID(), file, previewUrl }]);
  };

  const removeQueuedFile = (id: string) => {
    setQueuedFiles(prev => {
      const item = prev.find(f => f.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  onMount(() => {
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown));
  });

  onCleanup(() => {
    document.body.style.overflow = '';
    for (const f of queuedFiles()) {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    }
  });

  // ─── JSON paste state ───
  const [showJsonPaste, setShowJsonPaste] = createSignal(false);
  const [jsonText, setJsonText] = createSignal('');
  const [jsonError, setJsonError] = createSignal('');
  const [jsonAppliedFlash, setJsonAppliedFlash] = createSignal(false);

  // ─── Acceptance criteria (from JSON) ───
  const [criteria, setCriteria] = createSignal<{ text: string; is_met?: boolean }[]>([]);

  // ─── UI state ───
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal('');

  const activeProjects = () => data.projects().filter(p => p.status === 'active');
  const members = () => data.users().filter(u => u.is_active);

  const toggleInvolucrado = (id: string) => {
    setInvolucrados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const availableInvolucrados = () =>
    members().filter(m => m.id !== assigneeId());

  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const diasCortos = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  /** Get ISO week number (Mon=start) */
  const getWeekNumber = (d: Date) => {
    const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
    const week1 = new Date(tmp.getFullYear(), 0, 4);
    return 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  };

  const todayWeek = () => getWeekNumber(new Date());

  const getRelativeDateInfo = (type: 'hoy' | 'manana' | 'pasado' | 'semana') => {
    const today = new Date();

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
    const isNextWeek = getWeekNumber(targetDate) !== todayWeek();
    const sub = isNextWeek ? 'próx.' : 'esta sem';

    return { dateStr: toLocalDateStr(targetDate), label: dayName, sub };
  };

  const btnHoy = () => getRelativeDateInfo('hoy');
  const btnManana = () => getRelativeDateInfo('manana');
  const btnPasado = () => getRelativeDateInfo('pasado');
  const btnSemana = () => getRelativeDateInfo('semana');

  // ─── Apply JSON object to form fields ───
  const applyJson = (obj: Record<string, any>) => {
    if (obj.title) setTitle(obj.title);
    const parts: string[] = [];
    if (obj.purpose) parts.push(`## Para qué\n${obj.purpose}`);
    if (obj.description) parts.push(obj.description);
    if (obj.objective) parts.push(`## Objetivo\n${obj.objective}`);
    const desc = parts.join('\n\n').trim();
    if (desc) setDescription(desc);
    if (obj.priority && ['low', 'medium', 'high', 'critical'].includes(obj.priority)) {
      setPriority(obj.priority as Priority);
    }
    if (obj.status && ['backlog', 'todo', 'in_progress', 'done'].includes(obj.status)) {
      setStatus(obj.status as StoryStatus);
    }
    if (typeof obj.estimate === 'number') setEstimate(obj.estimate);
    if (obj.due_date) setDueDate(obj.due_date);

    const rawCriteria = findCriteria(obj);
    if (rawCriteria.length > 0) {
      setCriteria(rawCriteria.map((c: any) =>
        typeof c === 'string' ? { text: c } : { text: c.text, is_met: c.is_met }
      ));
    }


    // Flash notification
    setJsonAppliedFlash(true);
    setTimeout(() => setJsonAppliedFlash(false), 2000);

    // Close manual JSON paste area if open
    setShowJsonPaste(false);
    setJsonText('');
    setJsonError('');
  };

  // ─── Global paste interceptor (Cmd+V anywhere in modal) ───
  const handleGlobalPaste = (e: ClipboardEvent) => {
    // Don't intercept if the user is typing in the manual JSON textarea
    const target = e.target as HTMLElement;
    if (target.closest('[data-json-textarea]')) return;

    // Check for file paste first
    if (e.clipboardData?.items) {
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            queueFile(file);
          }
          return;
        }
      }
    }

    // Then check for JSON paste
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const parsed = parseStoryJson(text);
    if (parsed) {
      e.preventDefault(); // Block text from going into the title input
      applyJson(parsed);
    }
    // If not JSON, let normal paste happen (text goes into title)
  };

  // ─── Manual JSON paste area handler ───
  const handleJsonPasteArea = (text: string) => {
    setJsonText(text);
    setJsonError('');
    if (!text.trim()) return;

    const parsed = parseStoryJson(text);
    if (parsed) {
      applyJson(parsed);
    } else {
      setJsonError('JSON inválido o no contiene campos de historia');
    }
  };

  const removeCriterion = (index: number) => {
    setCriteria(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Submit ───
  const handleSubmit = async () => {
    const t = title().trim();
    if (!t) return;

    setSubmitting(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        title: t,
        priority: priority(),
        status: status(),
        category: props.defaultCategory ?? (status() === 'in_progress' ? 'today' : status() === 'backlog' ? 'backlog' : null),
        assignee_id: assigneeId(),
        project_id: projectId(),
      };

      if (description()) payload.description = description();
      if (estimate() > 0) payload.estimate = estimate();
      if (dueDate()) payload.due_date = dueDate();

      const created = await api.stories.create(payload);

      // Add involucrados
      const ids = Array.from(involucrados());
      if (ids.length > 0) {
        await Promise.allSettled(
          ids.map(uid => api.stories.addAssignee(created.id, uid))
        );
      }

      // Add acceptance criteria from JSON
      if (criteria().length > 0) {
        await api.stories.addCriteria(created.id, criteria());
      }

      // Upload queued files
      if (queuedFiles().length > 0) {
        setUploadingFiles(true);
        await Promise.allSettled(
          queuedFiles().map(qf => api.attachments.upload(created.id, qf.file))
        );
        setUploadingFiles(false);
      }

      props.onCreated?.();
      props.onClose();
    } catch (e: any) {
      setError(e.message || 'Error al crear la historia');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = () => !!title().trim() && !submitting();

  return (
    <div
      class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-300"
      onClick={() => props.onClose()}
    >
      <div
        class="relative bg-base-100 w-full sm:max-w-2xl sm:rounded-[24px] rounded-t-[32px] sm:rounded-t-[24px] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] sm:shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] mt-auto sm:mt-0 animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
        onPaste={handleGlobalPaste}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; setDragOver(true); }}
        onDragLeave={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const { clientX: x, clientY: y } = e;
          if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = e.dataTransfer?.files;
          if (files) for (const f of Array.from(files)) queueFile(f);
        }}
      >
        {/* JSON applied flash */}
        <Show when={jsonAppliedFlash()}>
          <div class="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ios-green-500 text-white text-[11px] font-semibold shadow-lg shadow-ios-green-500/30 animate-fade-in">
            <Sparkles size={12} />
            JSON aplicado
          </div>
        </Show>

        {/* Header */}
        <div class="shrink-0 px-5 sm:px-8 pt-5 sm:pt-6 pb-4 sm:pb-5 border-b border-base-content/[0.04]">
          <div class="flex items-center justify-between">
            <h2 class="text-[17px] sm:text-[18px] font-bold text-base-content/80 tracking-tight">Nueva historia</h2>
            <div class="flex items-center gap-2">
              <button
                onClick={() => setShowJsonPaste(!showJsonPaste())}
                class={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-wide transition-all ${showJsonPaste()
                  ? 'bg-ios-blue-500/10 text-ios-blue-500 border border-ios-blue-500/20 shadow-sm'
                  : 'bg-base-content/[0.02] text-base-content/30 hover:bg-base-content/[0.06] hover:text-base-content/60 border border-transparent'
                  }`}
                title="Pegar JSON para prellenar"
              >
                <Braces size={12} strokeWidth={2.5} />
                JSON
              </button>
              <button
                onClick={() => props.onClose()}
                class="p-2 -mr-2 rounded-full hover:bg-base-content/5 text-base-content/30 hover:text-base-content/70 transition-colors"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Property chips bar */}
        <div class="shrink-0 px-4 sm:px-6 py-2.5 border-b border-base-content/[0.04] flex items-center gap-1.5 flex-wrap">

          {/* Project chip */}
          <div class="relative">
            <button
              onClick={() => setShowProjectPicker(v => !v)}
              class={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                projectId() && activeProjects().find(p => p.id === projectId())
                  ? 'hover:opacity-80'
                  : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.08]'
              }`}
              style={(() => {
                const p = activeProjects().find(pr => pr.id === projectId());
                return p ? { "background-color": `${p.color}15`, color: p.color } : undefined;
              })()}
            >
              {(() => {
                const p = activeProjects().find(pr => pr.id === projectId());
                return p ? p.name : <span>Proyecto</span>;
              })()}
            </button>
            <Show when={showProjectPicker()}>
              <div class="fixed inset-0 z-20" onClick={() => setShowProjectPicker(false)} />
              <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-1.5 min-w-[200px] backdrop-blur-md">
                <button
                  onClick={() => { setProjectId(null); setShowProjectPicker(false); }}
                  class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all ${!projectId() ? 'bg-base-content/[0.06] text-base-content' : 'hover:bg-base-content/5 text-base-content/50'}`}
                >
                  Ninguno
                </button>
                <For each={activeProjects()}>
                  {(p) => (
                    <button
                      onClick={() => { setProjectId(p.id); setShowProjectPicker(false); }}
                      class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${projectId() === p.id ? 'bg-base-content/[0.06] text-base-content' : 'hover:bg-base-content/5 text-base-content/70'}`}
                    >
                      <div class="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[8px] font-bold text-white" style={{ "background-color": p.color }}>
                        {p.prefix.slice(0, 2)}
                      </div>
                      <span class="truncate">{p.name}</span>
                      <Show when={projectId() === p.id}>
                        <Check size={11} class="text-ios-blue-500 ml-auto shrink-0" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Status chip */}
          <div class="relative">
            <button
              onClick={() => setShowStatusPicker(v => !v)}
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-content/[0.04] hover:bg-base-content/[0.07] transition-all"
            >
              <span class={`w-2 h-2 rounded-full ${statusOptions.find(s => s.id === status())?.dot ?? 'bg-base-content/20'}`} />
              <span class="text-[11px] font-semibold text-base-content/60">{statusOptions.find(s => s.id === status())?.label ?? status()}</span>
            </button>
            <Show when={showStatusPicker()}>
              <div class="fixed inset-0 z-20" onClick={() => setShowStatusPicker(false)} />
              <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-1.5 min-w-[150px] backdrop-blur-md">
                <For each={statusOptions}>
                  {(opt) => (
                    <button
                      onClick={() => { setStatus(opt.id); setShowStatusPicker(false); }}
                      class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all ${status() === opt.id ? 'bg-base-content/[0.06] text-base-content' : 'hover:bg-base-content/5 text-base-content/60'}`}
                    >
                      <span class={`w-2.5 h-2.5 rounded-full ${opt.dot}`} />
                      {opt.label}
                      <Show when={status() === opt.id}>
                        <Check size={11} class="text-ios-blue-500 ml-auto" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Priority chip */}
          <div class="relative">
            {(() => {
              const curr = () => priorityOptions.find(p => p.id === priority()) || priorityOptions[1];
              const Icon = () => curr().icon;
              return (
                <>
                  <button
                    onClick={() => setShowPriorityPicker(v => !v)}
                    class={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all hover:opacity-80 ${curr().color} ${priority() !== 'medium' ? curr().selectedBg : 'bg-base-content/[0.04]'}`}
                  >
                    <Icon size={11} strokeWidth={2.5} />
                    {curr().label}
                  </button>
                  <Show when={showPriorityPicker()}>
                    <div class="fixed inset-0 z-20" onClick={() => setShowPriorityPicker(false)} />
                    <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-1.5 min-w-[150px] backdrop-blur-md">
                      <For each={priorityOptions}>
                        {(opt) => {
                          const PIcon = opt.icon;
                          return (
                            <button
                              onClick={() => { setPriority(opt.id); setShowPriorityPicker(false); }}
                              class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all ${priority() === opt.id ? `${opt.selectedBg} ${opt.color}` : 'hover:bg-base-content/5 text-base-content/60'}`}
                            >
                              <PIcon size={13} strokeWidth={2.5} />
                              {opt.label}
                              <Show when={priority() === opt.id}>
                                <Check size={11} class="text-ios-blue-500 ml-auto" />
                              </Show>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </>
              );
            })()}
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
              <Calendar size={11} />
              <span>{dueDate() ? dueDate().split('-').reverse().join('/') : 'Fecha'}</span>
            </button>
            <Show when={showDatePicker()}>
              <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-3 backdrop-blur-md min-w-[280px]" onClick={(e) => e.stopPropagation()}>
                <div class="flex flex-wrap gap-1.5 mb-3">
                  <For each={[btnHoy(), btnManana(), btnPasado(), btnSemana()]}>
                    {(btn) => {
                      const selected = () => dueDate() === btn.dateStr;
                      return (
                        <button
                          onClick={() => { setDueDate(btn.dateStr); setShowDatePicker(false); }}
                          class={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                            selected() ? 'bg-ios-blue-500/15 text-ios-blue-500' : 'bg-base-content/[0.05] text-base-content/50 hover:bg-base-content/[0.1]'
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
                  onSelect={(val) => { setDueDate(val); setShowDatePicker(false); }}
                  onClear={() => { setDueDate(''); setShowDatePicker(false); }}
                  onClose={() => setShowDatePicker(false)}
                  triggerEl={dateTriggerRef}
                />
                <Show when={dueDate()}>
                  <button
                    onClick={() => { setDueDate(''); setShowDatePicker(false); }}
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
              onClick={() => setShowEstimatePicker(v => !v)}
              class={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                estimate() > 0
                  ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/15'
                  : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.07]'
              }`}
            >
              {estimate() > 0 ? estimate() : 'Est.'}
            </button>
            <Show when={showEstimatePicker()}>
              <div class="fixed inset-0 z-20" onClick={() => setShowEstimatePicker(false)} />
              <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-2 backdrop-blur-md">
                <div class="flex gap-1">
                  <For each={fibonacciPoints}>
                    {(pts) => (
                      <button
                        onClick={() => { setEstimate(estimate() === pts ? 0 : pts); setShowEstimatePicker(false); }}
                        class={`w-9 h-9 rounded-xl text-[13px] font-bold transition-all ${
                          estimate() === pts ? 'bg-ios-blue-500 text-white shadow-sm' : 'hover:bg-base-content/5 text-base-content/60'
                        }`}
                      >
                        {pts}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>

          {/* Separator */}
          <div class="w-px h-4 bg-base-content/[0.06] mx-0.5" />

          {/* Assignee chip */}
          <div class="relative">
            <button
              onClick={() => setShowAssigneePicker(v => !v)}
              class="flex items-center gap-1 px-2 py-1 rounded-lg bg-base-content/[0.04] hover:bg-base-content/[0.07] transition-all"
            >
              {(() => {
                const m = members().find(u => u.id === assigneeId());
                return m ? (
                  <>
                    <img src={m.avatar_url!} alt="" class="w-5 h-5 rounded-full object-cover" />
                    <span class="text-[11px] font-medium text-base-content/60">{m.name.split(' ')[0]}</span>
                  </>
                ) : (
                  <span class="text-[11px] font-medium text-base-content/40">Encargado</span>
                );
              })()}
            </button>
            <Show when={showAssigneePicker()}>
              <div class="fixed inset-0 z-20" onClick={() => setShowAssigneePicker(false)} />
              <div class="absolute top-[calc(100%+6px)] left-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-1.5 min-w-[180px] backdrop-blur-md">
                <For each={members()}>
                  {(member) => (
                    <button
                      onClick={() => {
                        setAssigneeId(member.id);
                        setInvolucrados(prev => { const next = new Set(prev); next.delete(member.id); return next; });
                        setShowAssigneePicker(false);
                      }}
                      class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all ${assigneeId() === member.id ? 'bg-base-content/[0.06] text-base-content' : 'hover:bg-base-content/5 text-base-content/60'}`}
                    >
                      <Show when={member.avatar_url} fallback={<div class="w-5 h-5 rounded-full bg-base-content/10 flex items-center justify-center text-[9px] font-bold">{member.name.charAt(0)}</div>}>
                        <img src={member.avatar_url!} alt="" class="w-5 h-5 rounded-full object-cover" />
                      </Show>
                      {member.name.split(' ')[0]}
                      <Show when={assigneeId() === member.id}>
                        <Check size={11} class="text-ios-blue-500 ml-auto" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Involucrados chip */}
          <div class="relative">
            <button
              onClick={() => setShowInvolucradosPicker(v => !v)}
              class={`w-6 h-6 rounded-full flex items-center justify-center transition-all border border-dashed ${
                involucrados().size > 0
                  ? 'bg-ios-blue-500/10 text-ios-blue-500 border-ios-blue-500/30'
                  : 'text-base-content/30 border-base-content/15 hover:text-ios-blue-500 hover:bg-ios-blue-500/10 hover:border-ios-blue-500/30'
              }`}
              title="Involucrados"
            >
              <Show when={involucrados().size > 0} fallback={<UserPlus size={11} />}>
                <span class="text-[10px] font-bold">{involucrados().size}</span>
              </Show>
            </button>
            <Show when={showInvolucradosPicker()}>
              <div class="fixed inset-0 z-20" onClick={() => setShowInvolucradosPicker(false)} />
              <div class="absolute top-[calc(100%+6px)] right-0 z-30 bg-base-100 rounded-2xl border border-base-content/[0.08] shadow-xl shadow-black/20 p-1.5 min-w-[180px] backdrop-blur-md">
                <For each={availableInvolucrados()}>
                  {(member) => {
                    const selected = () => involucrados().has(member.id);
                    return (
                      <button
                        onClick={() => toggleInvolucrado(member.id)}
                        class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all ${selected() ? 'bg-ios-blue-500/10 text-ios-blue-500' : 'hover:bg-base-content/5 text-base-content/60'}`}
                      >
                        <Show when={member.avatar_url} fallback={<div class="w-5 h-5 rounded-full bg-base-content/10 flex items-center justify-center text-[9px] font-bold">{member.name.charAt(0)}</div>}>
                          <img src={member.avatar_url!} alt="" class="w-5 h-5 rounded-full object-cover" />
                        </Show>
                        {member.name.split(' ')[0]}
                        <Show when={selected()}>
                          <Check size={11} class="text-ios-blue-500 ml-auto" />
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>

          {/* Attach button */}
          <button
            onClick={() => fileInput.click()}
            class={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              queuedFiles().length > 0
                ? 'bg-base-content/[0.06] text-base-content/60'
                : 'bg-base-content/[0.04] text-base-content/40 hover:bg-base-content/[0.07]'
            }`}
          >
            <Paperclip size={11} />
            <Show when={queuedFiles().length > 0}>
              <span>{queuedFiles().length}</span>
            </Show>
          </button>
        </div>

        {/* Scrollable body */}
        <div class="flex-1 overflow-y-auto px-5 sm:px-8 py-5 sm:py-6 space-y-4 sm:space-y-5 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:pb-8">

          {/* JSON paste area (inline, collapsible) */}
          <Show when={showJsonPaste()}>
            <div class="rounded-2xl bg-base-content/[0.02] border border-dashed border-base-content/[0.08] p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-base-content/40">
                <div class="flex items-center justify-center w-5 h-5 rounded bg-base-content/[0.04]">
                  <Braces size={12} strokeWidth={2.5} />
                </div>
                Pegar JSON abstracto
              </div>
              <textarea
                data-json-textarea
                ref={(el) => setTimeout(() => el.focus(), 50)}
                value={jsonText()}
                onInput={(e) => setJsonText(e.currentTarget.value)}
                onPaste={(e) => {
                  setTimeout(() => handleJsonPasteArea(e.currentTarget.value), 0);
                }}
                placeholder={'{\n  "title": "...",\n  "description": "...",\n  "purpose": "...",\n  "objective": "...",\n  "acceptanceCriteria": ["..."]\n}'}
                rows={5}
                class="w-full bg-base-content/[0.02] rounded-xl px-4 py-3 text-[12px] font-mono outline-none resize-none placeholder:text-base-content/15 focus:bg-base-content/[0.04] focus:ring-1 focus:ring-ios-blue-500/30 transition-all leading-relaxed"
                spellcheck={false}
              />
              <div class="flex items-center gap-2">
                <button
                  onClick={() => handleJsonPasteArea(jsonText())}
                  disabled={!jsonText().trim()}
                  class={`px-4 py-2 rounded-xl text-[12px] font-bold transition-all duration-200 ${jsonText().trim()
                    ? 'bg-ios-blue-500 text-white shadow-sm shadow-ios-blue-500/20 active:scale-[0.98]'
                    : 'bg-base-content/[0.04] text-base-content/20 cursor-not-allowed'
                    }`}
                >
                  Confirmar importación
                </button>
                <button
                  onClick={() => { setShowJsonPaste(false); setJsonText(''); setJsonError(''); }}
                  class="px-4 py-2 rounded-xl text-[12px] font-bold text-base-content/30 hover:text-base-content/60 hover:bg-base-content/[0.04] transition-all"
                >
                  Cancelar
                </button>
                <Show when={jsonError()}>
                  <span class="flex items-center gap-1.5 text-[11px] font-semibold text-red-500 ml-auto bg-red-500/10 px-3 py-1.5 rounded-lg">
                    <AlertCircle size={12} strokeWidth={2.5} />
                    {jsonError()}
                  </span>
                </Show>
              </div>
            </div>
          </Show>

          {/* Title */}
          <div class="relative group">
            <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-md bg-transparent transition-colors group-focus-within:bg-ios-blue-500/40" />
            <input
              ref={(el) => !showJsonPaste() && setTimeout(() => el.focus(), 50)}
              type="text"
              placeholder="¿Qué necesitas hacer?"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              class="w-full text-[24px] sm:text-[26px] font-extrabold bg-transparent outline-none placeholder:text-base-content/15 tracking-tight text-base-content/90 focus:text-base-content transition-colors px-4 py-1"
            />
          </div>

          {/* Description — always visible */}
          <fieldset class="px-1">
            <legend class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/30 mb-3 px-1">Descripción</legend>
            <textarea
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              placeholder="Describe la historia..."
              rows={4}
              class="w-full min-h-[120px] bg-base-content/[0.02] border border-base-content/[0.08] rounded-2xl px-4 py-3 text-[14px] font-medium outline-none resize-none placeholder:text-base-content/20 focus:bg-base-content/[0.03] focus:border-base-content/15 hover:border-base-content/12 focus:ring-1 focus:ring-ios-blue-500/30 transition-all leading-relaxed"
            />
          </fieldset>

          {/* Acceptance Criteria preview (from JSON) */}
          <Show when={criteria().length > 0}>
            <fieldset>
              <legend class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/30 mb-3 px-1">
                <span class="flex items-center gap-2">
                  <ClipboardCheck size={12} strokeWidth={2.5} />
                  Criterios de aceptación
                  <span class="text-ios-green-500 normal-case tracking-normal">{criteria().length}</span>
                </span>
              </legend>
              <div class="rounded-2xl bg-base-content/[0.02] border border-base-content/[0.04] p-3 space-y-1.5 mx-1">
                <For each={criteria()}>
                  {(c, i) => (
                    <div class="flex items-start gap-2.5 group p-1.5 rounded-lg hover:bg-base-content/[0.04] transition-colors">
                      <Check size={14} strokeWidth={3} class="text-ios-green-500 mt-0.5 shrink-0" />
                      <span class="text-[12px] text-base-content/70 font-medium flex-1 leading-relaxed">{c.text}</span>
                      <button
                        onClick={() => removeCriterion(i())}
                        class="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/10 transition-all shrink-0"
                      >
                        <Trash2 size={13} class="text-red-400" />
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </fieldset>
          </Show>

          {/* Drag overlay */}
          <Show when={dragOver()}>
            <div class="flex items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed border-ios-blue-500/40 bg-ios-blue-500/[0.06] text-ios-blue-500/60 mb-4 mx-1">
              <ImagePlus size={20} strokeWidth={2.5} />
              <span class="text-[13px] font-bold">Suelta aquí para adjuntar</span>
            </div>
          </Show>

          {/* Hidden file input (always mounted) */}
          <input
            ref={fileInput}
            type="file"
            multiple
            class="hidden"
            onChange={() => {
              const files = fileInput.files;
              if (files) for (const f of Array.from(files)) queueFile(f);
              fileInput.value = '';
            }}
          />

          {/* Queued files preview */}
          <Show when={queuedFiles().length > 0}>
            <fieldset>
              <legend class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/30 mb-3 px-1">
                <span class="flex items-center gap-2">
                  <Paperclip size={12} strokeWidth={2.5} />
                  Adjuntos
                  <span class="text-ios-blue-500 normal-case tracking-normal">{queuedFiles().length}</span>
                </span>
              </legend>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 px-1">
                <For each={queuedFiles()}>
                  {(qf) => (
                    <div class="group relative rounded-xl overflow-hidden bg-base-200/40 border border-base-content/[0.06] shadow-sm">
                      <Show
                        when={qf.previewUrl}
                        fallback={
                          <div class="flex flex-col items-center justify-center gap-1.5 py-4 px-2">
                            <FileIcon size={20} strokeWidth={2.5} class="text-base-content/30" />
                            <p class="text-[9px] font-medium truncate w-full text-center text-base-content/50">{qf.file.name}</p>
                            <p class="text-[8px] font-bold text-base-content/30">{formatFileSize(qf.file.size)}</p>
                          </div>
                        }
                      >
                        <img src={qf.previewUrl!} alt={qf.file.name} class="w-full h-20 object-cover" />
                        <div class="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-md px-2 py-1.5">
                          <p class="text-[9px] font-medium truncate text-white/90">{qf.file.name}</p>
                        </div>
                      </Show>
                      <button
                        onClick={() => removeQueuedFile(qf.id)}
                        class="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white/70 hover:text-white hover:bg-red-500/90 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                </For>
                {/* Add more button */}
                <button
                  onClick={() => fileInput.click()}
                  class="flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border border-dashed border-base-content/[0.12] text-base-content/30 hover:border-base-content/25 hover:text-base-content/50 hover:bg-base-content/[0.02] transition-all"
                >
                  <ImagePlus size={18} strokeWidth={2.5} />
                  <span class="text-[10px] font-bold">Agregar</span>
                </button>
              </div>
            </fieldset>
          </Show>

        </div>

        {/* Footer */}
        <div class="shrink-0 px-6 sm:px-8 py-5 border-t border-base-content/[0.04] bg-base-100/50 backdrop-blur-md">
          <Show when={error()}>
            <p class="text-[12px] font-bold text-red-500 mb-3 px-2 flex items-center gap-1.5 bg-red-500/10 rounded-lg py-2"><AlertCircle size={14} strokeWidth={2.5} />{error()}</p>
          </Show>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit()}
            class={`w-full py-3.5 sm:py-3.5 rounded-2xl text-[14px] font-bold tracking-wide transition-all duration-200 ${canSubmit()
              ? 'bg-ios-blue-500 text-white active:scale-[0.98] shadow-lg shadow-ios-blue-500/30 hover:brightness-110'
              : 'bg-base-content/[0.03] text-base-content/20 cursor-not-allowed border border-base-content/[0.05]'
              }`}
          >
            {uploadingFiles() ? 'Subiendo adjuntos...' : submitting() ? 'Creando...' : 'Crear historia'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateStoryModal;
