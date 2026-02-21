import { createSignal, For, Show, onCleanup, type Component } from 'solid-js';
import type { Priority, StoryStatus, ReportCategory } from '../types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import {
  X, ChevronDown, ChevronUp, Check,
  Flame, ArrowUp, ArrowRight, ArrowDown,
  Calendar, UserPlus, Braces, ClipboardPaste,
  ClipboardCheck, AlertCircle, Trash2, Sparkles,
  Paperclip, ImagePlus, FileIcon, Loader2,
} from 'lucide-solid';

interface Props {
  onClose: () => void;
  onCreated?: () => void;
  defaultCategory?: ReportCategory;
  defaultProjectId?: string;
}

const priorityOptions: { id: Priority; label: string; color: string; bg: string; selectedBg: string; icon: any }[] = [
  { id: 'low', label: 'Baja', color: 'text-base-content/50', bg: 'bg-base-content/[0.03]', selectedBg: 'bg-base-content/8 ring-1 ring-base-content/10', icon: ArrowDown },
  { id: 'medium', label: 'Media', color: 'text-ios-blue-500', bg: 'bg-ios-blue-500/[0.03]', selectedBg: 'bg-ios-blue-500/10 ring-1 ring-ios-blue-500/20', icon: ArrowRight },
  { id: 'high', label: 'Alta', color: 'text-orange-500', bg: 'bg-orange-500/[0.03]', selectedBg: 'bg-orange-500/10 ring-1 ring-orange-500/20', icon: ArrowUp },
  { id: 'critical', label: 'Crítica', color: 'text-red-500', bg: 'bg-red-500/[0.03]', selectedBg: 'bg-red-500/10 ring-1 ring-red-500/20', icon: Flame },
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
  const [showDetails, setShowDetails] = createSignal(false);
  const [status, setStatus] = createSignal<StoryStatus>(defaultStatus);
  const [description, setDescription] = createSignal('');
  const [purpose, setPurpose] = createSignal('');
  const [objective, setObjective] = createSignal('');
  const [estimate, setEstimate] = createSignal<number>(0);
  const [dueDate, setDueDate] = createSignal('');

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

  onCleanup(() => {
    // Clean up object URLs
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

  const setDueDateRelative = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDueDate(d.toISOString().split('T')[0]);
  };

  // ─── Apply JSON object to form fields ───
  const applyJson = (obj: Record<string, any>) => {
    if (obj.title) setTitle(obj.title);
    if (obj.description) setDescription(obj.description);
    if (obj.purpose) setPurpose(obj.purpose);
    if (obj.objective) setObjective(obj.objective);
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

    if (obj.description || obj.purpose || obj.objective || rawCriteria.length > 0) {
      setShowDetails(true);
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
      if (purpose()) payload.purpose = purpose();
      if (objective()) payload.objective = objective();
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
      class="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={() => props.onClose()}
    >
      <div
        class="relative bg-base-100 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[calc(100vh-2.5rem)]"
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
        <div class="shrink-0 px-6 pt-4 pb-3 border-b border-base-content/[0.06]">
          <div class="flex items-center justify-between">
            <h2 class="text-[13px] font-semibold text-base-content/70">Nueva historia</h2>
            <div class="flex items-center gap-1">
              <button
                onClick={() => setShowJsonPaste(!showJsonPaste())}
                class={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                  showJsonPaste()
                    ? 'bg-ios-blue-500/10 text-ios-blue-500'
                    : 'text-base-content/25 hover:bg-base-content/5 hover:text-base-content/40'
                }`}
                title="Pegar JSON para prellenar"
              >
                <ClipboardPaste size={11} />
                JSON
              </button>
              <button
                onClick={() => props.onClose()}
                class="p-2 rounded-lg hover:bg-base-content/8 transition-colors"
              >
                <X size={16} class="text-base-content/30" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div class="flex-1 overflow-y-auto px-6 py-4">

          {/* JSON paste area (inline, collapsible) */}
          <Show when={showJsonPaste()}>
            <div class="mb-5 rounded-xl bg-base-content/[0.02] border border-dashed border-base-content/[0.08] p-3 space-y-2">
              <div class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-base-content/25">
                <Braces size={10} />
                Pegar JSON para prellenar campos
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
                class="w-full bg-base-content/[0.03] rounded-lg px-3 py-2 text-[11px] font-mono outline-none resize-none placeholder:text-base-content/10 focus:bg-base-content/[0.05] focus:ring-1 focus:ring-ios-blue-500/20 transition-all leading-relaxed"
                spellcheck={false}
              />
              <div class="flex items-center gap-2">
                <button
                  onClick={() => handleJsonPasteArea(jsonText())}
                  disabled={!jsonText().trim()}
                  class={`px-3 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    jsonText().trim()
                      ? 'bg-ios-blue-500 text-white active:scale-[0.97]'
                      : 'bg-base-content/[0.04] text-base-content/15 cursor-not-allowed'
                  }`}
                >
                  Aplicar
                </button>
                <button
                  onClick={() => { setShowJsonPaste(false); setJsonText(''); setJsonError(''); }}
                  class="px-3 py-1 rounded-lg text-[11px] font-medium text-base-content/30 hover:text-base-content/50 transition-all"
                >
                  Cancelar
                </button>
                <Show when={jsonError()}>
                  <span class="flex items-center gap-1 text-[10px] text-red-500 ml-auto">
                    <AlertCircle size={10} />
                    {jsonError()}
                  </span>
                </Show>
              </div>
            </div>
          </Show>

          {/* Title */}
          <input
            ref={(el) => !showJsonPaste() && setTimeout(() => el.focus(), 50)}
            type="text"
            placeholder="¿Qué necesitas hacer?"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            class="w-full text-[16px] font-semibold bg-transparent outline-none placeholder:text-base-content/15 mb-5"
          />

          {/* Project chips */}
          <fieldset class="mb-4">
            <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">Proyecto</legend>
            <div class="flex flex-wrap gap-1.5">
              <button
                onClick={() => setProjectId(null)}
                class={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  projectId() === null
                    ? 'bg-base-content/8 text-base-content ring-1 ring-base-content/10'
                    : 'text-base-content/30 hover:bg-base-content/5'
                }`}
              >
                Ninguno
              </button>
              <For each={activeProjects()}>
                {(proj) => {
                  const selected = () => projectId() === proj.id;
                  return (
                    <button
                      onClick={() => setProjectId(proj.id)}
                      class={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        selected() ? 'ring-1' : 'hover:opacity-80'
                      }`}
                      style={{
                        "background-color": `${proj.color}${selected() ? '18' : '0a'}`,
                        color: proj.color,
                        ...(selected() ? { "box-shadow": `inset 0 0 0 1px ${proj.color}30` } : {}),
                      }}
                    >
                      <Show when={proj.icon_url}>
                        <img src={proj.icon_url!} alt="" class="w-3.5 h-3.5 rounded-sm" />
                      </Show>
                      {proj.name}
                    </button>
                  );
                }}
              </For>
            </div>
          </fieldset>

          {/* Priority + Encargado */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <fieldset>
              <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">Prioridad</legend>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-1">
                <For each={priorityOptions}>
                  {(opt) => {
                    const Icon = opt.icon;
                    const selected = () => priority() === opt.id;
                    return (
                      <button
                        onClick={() => setPriority(opt.id)}
                        class={`flex flex-col items-center gap-0.5 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-[10px] font-medium transition-all ${
                          selected() ? `${opt.selectedBg} ${opt.color}` : `${opt.bg} text-base-content/25 hover:text-base-content/40`
                        }`}
                      >
                        <Icon size={13} />
                        <span>{opt.label}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </fieldset>

            <fieldset>
              <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">Encargado</legend>
              <div class="flex flex-wrap gap-x-2.5 gap-y-1.5">
                <For each={members()}>
                  {(member) => {
                    const selected = () => assigneeId() === member.id;
                    return (
                      <button
                        onClick={() => {
                          setAssigneeId(member.id);
                          setInvolucrados(prev => { const next = new Set(prev); next.delete(member.id); return next; });
                        }}
                        class={`flex flex-col items-center gap-0.5 transition-all ${selected() ? 'opacity-100' : 'opacity-25 hover:opacity-55'}`}
                      >
                        <div class={`rounded-full transition-all ${selected() ? 'ring-[1.5px] ring-ios-blue-500 ring-offset-[1.5px] ring-offset-base-100' : ''}`}>
                          <Show
                            when={member.avatar_url}
                            fallback={
                              <div class="w-6 h-6 rounded-full bg-base-content/10 flex items-center justify-center text-[9px] font-bold text-base-content/40">
                                {member.name.charAt(0)}
                              </div>
                            }
                          >
                            <img src={member.avatar_url!} alt={member.name} class="w-6 h-6 rounded-full" />
                          </Show>
                        </div>
                        <span class="text-[8px] text-base-content/40 max-w-[40px] truncate leading-none">{member.name.split(' ')[0]}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </fieldset>
          </div>

          {/* Involucrados */}
          <fieldset class="mb-4">
            <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">
              <span class="flex items-center gap-1.5">
                <UserPlus size={10} />
                Involucrados
                <Show when={involucrados().size > 0}>
                  <span class="text-ios-blue-500 normal-case tracking-normal">{involucrados().size}</span>
                </Show>
              </span>
            </legend>
            <div class="flex flex-wrap gap-1.5">
              <For each={availableInvolucrados()}>
                {(member) => {
                  const selected = () => involucrados().has(member.id);
                  return (
                    <button
                      onClick={() => toggleInvolucrado(member.id)}
                      class={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                        selected()
                          ? 'bg-ios-blue-500/10 text-ios-blue-500 ring-1 ring-ios-blue-500/20'
                          : 'bg-base-content/[0.03] text-base-content/35 hover:bg-base-content/[0.06]'
                      }`}
                    >
                      <div class="relative">
                        <Show
                          when={member.avatar_url}
                          fallback={
                            <div class="w-5 h-5 rounded-full bg-base-content/10 flex items-center justify-center text-[8px] font-bold">
                              {member.name.charAt(0)}
                            </div>
                          }
                        >
                          <img src={member.avatar_url!} alt="" class="w-5 h-5 rounded-full" />
                        </Show>
                        <Show when={selected()}>
                          <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-ios-blue-500 flex items-center justify-center">
                            <Check size={7} class="text-white" strokeWidth={3} />
                          </div>
                        </Show>
                      </div>
                      {member.name.split(' ')[0]}
                    </button>
                  );
                }}
              </For>
            </div>
          </fieldset>

          {/* Estado + Estimación */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <fieldset>
              <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">Estado</legend>
              <div class="grid grid-cols-2 gap-1">
                <For each={statusOptions}>
                  {(opt) => (
                    <button
                      onClick={() => setStatus(opt.id)}
                      class={`flex items-center justify-center gap-1.5 py-2 sm:py-1.5 rounded-lg text-xs sm:text-[11px] font-medium transition-all ${
                        status() === opt.id
                          ? 'bg-base-content/8 text-base-content ring-1 ring-base-content/10'
                          : 'text-base-content/25 hover:bg-base-content/[0.03]'
                      }`}
                    >
                      <div class={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
                      {opt.label}
                    </button>
                  )}
                </For>
              </div>
            </fieldset>

            <fieldset>
              <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">Estimación</legend>
              <div class="grid grid-cols-3 sm:grid-cols-6 gap-1">
                <For each={fibonacciPoints}>
                  {(pts) => (
                    <button
                      onClick={() => setEstimate(estimate() === pts ? 0 : pts)}
                      class={`h-9 sm:h-8 rounded-lg text-xs sm:text-[11px] font-bold transition-all ${
                        estimate() === pts
                          ? 'bg-ios-blue-500 text-white shadow-sm shadow-ios-blue-500/20'
                          : 'bg-base-content/[0.03] text-base-content/30 hover:bg-base-content/8'
                      }`}
                    >
                      {pts}
                    </button>
                  )}
                </For>
              </div>
            </fieldset>
          </div>

          {/* Fecha límite */}
          <fieldset class="mb-4">
            <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">Fecha límite</legend>
            <div class="flex items-center gap-1.5">
              <button onClick={() => setDueDateRelative(0)}
                class={`px-3 py-2 sm:px-2.5 sm:py-1 rounded-lg text-xs sm:text-[11px] font-medium transition-all ${
                  dueDate() === new Date().toISOString().split('T')[0]
                    ? 'bg-base-content/8 text-base-content ring-1 ring-base-content/10'
                    : 'bg-base-content/[0.03] text-base-content/40 hover:bg-base-content/8'
                }`}>Hoy</button>
              <button onClick={() => setDueDateRelative(1)}
                class={`px-3 py-2 sm:px-2.5 sm:py-1 rounded-lg text-xs sm:text-[11px] font-medium transition-all ${
                  (() => { const t = new Date(); t.setDate(t.getDate() + 1); return dueDate() === t.toISOString().split('T')[0]; })()
                    ? 'bg-base-content/8 text-base-content ring-1 ring-base-content/10'
                    : 'bg-base-content/[0.03] text-base-content/40 hover:bg-base-content/8'
                }`}>Mañana</button>
              <button onClick={() => setDueDateRelative(7)}
                class="px-3 py-2 sm:px-2.5 sm:py-1 rounded-lg text-xs sm:text-[11px] font-medium bg-base-content/[0.03] text-base-content/40 hover:bg-base-content/8 transition-all">+1 sem</button>
              <div class="flex items-center gap-1.5 ml-auto">
                <Calendar size={12} class="text-base-content/20 shrink-0" />
                <input type="date" value={dueDate()} onInput={(e) => setDueDate(e.currentTarget.value)}
                  class="bg-base-content/[0.03] rounded-lg px-2 py-1 text-[11px] outline-none text-base-content/50 focus:ring-1 focus:ring-ios-blue-500/20 transition-all" />
              </div>
            </div>
            <Show when={dueDate()}>
              <button onClick={() => setDueDate('')} class="text-[10px] text-base-content/25 hover:text-base-content/50 transition-colors mt-1">
                Quitar fecha
              </button>
            </Show>
          </fieldset>

          {/* Acceptance Criteria preview (from JSON) */}
          <Show when={criteria().length > 0}>
            <fieldset class="mb-4">
              <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">
                <span class="flex items-center gap-1.5">
                  <ClipboardCheck size={10} />
                  Criterios de aceptación
                  <span class="text-ios-green-500 normal-case tracking-normal">{criteria().length}</span>
                </span>
              </legend>
              <div class="rounded-xl bg-base-content/[0.02] border border-base-content/[0.04] p-2.5 space-y-1">
                <For each={criteria()}>
                  {(c, i) => (
                    <div class="flex items-start gap-2 group">
                      <Check size={10} class="text-ios-green-500 mt-0.5 shrink-0" />
                      <span class="text-[11px] text-base-content/60 flex-1 leading-snug">{c.text}</span>
                      <button
                        onClick={() => removeCriterion(i())}
                        class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/10 transition-all shrink-0"
                      >
                        <Trash2 size={10} class="text-red-400" />
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </fieldset>
          </Show>

          {/* Drag overlay */}
          <Show when={dragOver()}>
            <div class="flex items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-ios-blue-500/40 bg-ios-blue-500/[0.06] text-ios-blue-500/60 mb-4">
              <ImagePlus size={18} />
              <span class="text-xs font-medium">Suelta aquí para adjuntar</span>
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
            <fieldset class="mb-4">
              <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">
                <span class="flex items-center gap-1.5">
                  <Paperclip size={10} />
                  Adjuntos
                  <span class="text-ios-blue-500 normal-case tracking-normal">{queuedFiles().length}</span>
                </span>
              </legend>
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <For each={queuedFiles()}>
                  {(qf) => (
                    <div class="group relative rounded-lg overflow-hidden bg-base-200/40 border border-base-content/[0.06]">
                      <Show
                        when={qf.previewUrl}
                        fallback={
                          <div class="flex flex-col items-center justify-center gap-1 py-3 px-2">
                            <FileIcon size={16} class="text-base-content/30" />
                            <p class="text-[9px] truncate w-full text-center text-base-content/40">{qf.file.name}</p>
                            <p class="text-[8px] text-base-content/20">{formatFileSize(qf.file.size)}</p>
                          </div>
                        }
                      >
                        <img src={qf.previewUrl!} alt={qf.file.name} class="w-full h-16 object-cover" />
                        <p class="text-[8px] truncate px-1.5 py-1 text-base-content/40">{qf.file.name}</p>
                      </Show>
                      <button
                        onClick={() => removeQueuedFile(qf.id)}
                        class="absolute top-1 right-1 p-1 rounded bg-black/40 text-white/70 hover:text-white hover:bg-red-500/80 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}
                </For>
                {/* Add more button */}
                <button
                  onClick={() => fileInput.click()}
                  class="flex flex-col items-center justify-center gap-1 py-3 rounded-lg border border-dashed border-base-content/[0.08] text-base-content/20 hover:border-base-content/15 hover:text-base-content/30 transition-all"
                >
                  <ImagePlus size={16} />
                  <span class="text-[9px]">Agregar</span>
                </button>
              </div>
            </fieldset>
          </Show>

          {/* Attach button when no files queued */}
          <Show when={queuedFiles().length === 0 && !dragOver()}>
            <button
              onClick={() => fileInput.click()}
              class="flex items-center gap-1.5 text-[11px] text-base-content/25 hover:text-base-content/40 transition-colors mb-3"
            >
              <Paperclip size={12} />
              Adjuntar archivos
            </button>
          </Show>

          {/* Divider + Toggle details */}
          <div class="border-t border-base-content/[0.06] pt-3">
            <button
              onClick={() => setShowDetails(!showDetails())}
              class="flex items-center gap-1.5 text-[11px] font-medium text-base-content/30 hover:text-base-content/50 transition-colors"
            >
              <Show when={showDetails()} fallback={<ChevronDown size={13} />}>
                <ChevronUp size={13} />
              </Show>
              {showDetails() ? 'Menos detalles' : 'Más detalles'}
            </button>
          </div>

          {/* Expandable details — only text fields */}
          <Show when={showDetails()}>
            <div class="space-y-4 pt-4">
              <fieldset>
                <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">Descripción</legend>
                <textarea
                  value={description()}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                  placeholder="Describe la historia..."
                  rows={2}
                  class="w-full bg-base-content/[0.03] rounded-xl px-3.5 py-2.5 sm:py-2 text-[16px] sm:text-sm outline-none resize-none placeholder:text-base-content/15 focus:bg-base-content/[0.05] focus:ring-1 focus:ring-ios-blue-500/20 transition-all"
                />
              </fieldset>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <fieldset>
                  <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">¿Para qué?</legend>
                  <textarea
                    value={purpose()}
                    onInput={(e) => setPurpose(e.currentTarget.value)}
                    placeholder="¿Qué valor aporta?"
                    rows={2}
                    class="w-full bg-base-content/[0.03] rounded-xl px-3.5 py-2.5 sm:py-2 text-[16px] sm:text-sm outline-none resize-none placeholder:text-base-content/15 focus:bg-base-content/[0.05] focus:ring-1 focus:ring-ios-blue-500/20 transition-all"
                  />
                </fieldset>

                <fieldset>
                  <legend class="text-[10px] font-semibold uppercase tracking-widest text-base-content/25 mb-2">Objetivo</legend>
                  <textarea
                    value={objective()}
                    onInput={(e) => setObjective(e.currentTarget.value)}
                    placeholder="¿Resultado esperado?"
                    rows={2}
                    class="w-full bg-base-content/[0.03] rounded-xl px-3.5 py-2.5 sm:py-2 text-[16px] sm:text-sm outline-none resize-none placeholder:text-base-content/15 focus:bg-base-content/[0.05] focus:ring-1 focus:ring-ios-blue-500/20 transition-all"
                  />
                </fieldset>
              </div>
            </div>
          </Show>
        </div>

        {/* Footer */}
        <div class="shrink-0 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 pt-3 border-t border-base-content/[0.06]">
          <Show when={error()}>
            <p class="text-[11px] text-red-500 mb-2">{error()}</p>
          </Show>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit()}
            class={`w-full py-3 sm:py-2.5 rounded-xl text-sm sm:text-[13px] font-semibold transition-all ${
              canSubmit()
                ? 'bg-ios-blue-500 text-white active:scale-[0.98] shadow-sm shadow-ios-blue-500/20'
                : 'bg-base-content/[0.04] text-base-content/15 cursor-not-allowed'
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
