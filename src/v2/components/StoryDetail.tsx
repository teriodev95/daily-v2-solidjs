import { createSignal, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import type { Story, AcceptanceCriteria, User } from '../types';
import { useData } from '../lib/data';
import { api } from '../lib/api';
import {
  X, CheckCircle, Circle, Flame, ArrowUp, ArrowRight, ArrowDown,
  Calendar, Target, FileText, HelpCircle, ClipboardCheck, Trash2,
  Check, Loader2, UserPlus,
} from 'lucide-solid';
import AttachmentSection from './AttachmentSection';

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
}

type SaveStatus = 'idle' | 'saving' | 'saved';

const URL_RE = /(https?:\/\/[^\s<>\"')\]]+)/g;

const Linkify: Component<{ text: string; class?: string }> = (p) => {
  const parts = () => {
    const result: { text: string; isUrl: boolean }[] = [];
    let last = 0;
    const str = p.text;
    let match: RegExpExecArray | null;
    URL_RE.lastIndex = 0;
    while ((match = URL_RE.exec(str)) !== null) {
      if (match.index > last) result.push({ text: str.slice(last, match.index), isUrl: false });
      result.push({ text: match[0], isUrl: true });
      last = match.index + match[0].length;
    }
    if (last < str.length) result.push({ text: str.slice(last), isUrl: false });
    return result;
  };

  return (
    <span class={p.class}>
      <For each={parts()}>
        {(part) => part.isUrl
          ? <a href={part.text} target="_blank" rel="noopener noreferrer" class="text-ios-blue-500 hover:underline break-all">{part.text}</a>
          : <>{part.text}</>
        }
      </For>
    </span>
  );
};

const StoryDetail: Component<Props> = (props) => {
  const data = useData();

  // Editable fields
  const [title, setTitle] = createSignal(props.story.title);
  const [purpose, setPurpose] = createSignal(props.story.purpose || '');
  const [description, setDescription] = createSignal(props.story.description || '');
  const [objective, setObjective] = createSignal(props.story.objective || '');
  const [dueDate, setDueDate] = createSignal(props.story.due_date || '');
  const [assigneeId, setAssigneeId] = createSignal(props.story.assignee_id || '');
  const [assigneeIds, setAssigneeIds] = createSignal<string[]>([]);
  const [showAssigneePicker, setShowAssigneePicker] = createSignal(false);
  const [estimate, setEstimate] = createSignal(props.story.estimate || 0);
  const [showEstimatePicker, setShowEstimatePicker] = createSignal(false);
  const [editingDesc, setEditingDesc] = createSignal(false);

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
        props.onUpdated?.(props.story.id, fields);
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
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
      setSaveStatus('idle');
    }
  };

  // Attachment paste upload ref
  let attachmentUploadRef: ((file: File) => Promise<void>) | undefined;

  // Fetch story details
  const [criteriaList, setCriteriaList] = createSignal<AcceptanceCriteria[]>([]);
  const [confirming, setConfirming] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [deleteError, setDeleteError] = createSignal('');
  const [detailLoaded, setDetailLoaded] = createSignal(false);

  onMount(async () => {
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
    onCleanup(() => document.removeEventListener('paste', handlePaste));

    try {
      const detail = await api.stories.get(props.story.id);
      setCriteriaList(detail.criteria ?? []);
      setAssigneeIds(detail.assignees ?? []);
      setTitle(detail.title);
      setPurpose(detail.purpose || '');
      setDescription(detail.description || '');
      setObjective(detail.objective || '');
      setDueDate(detail.due_date || '');
      setEstimate(detail.estimate || 0);
      setAssigneeId(detail.assignee_id || '');
    } catch { /* story detail is supplementary */ }
    setDetailLoaded(true);
  });

  const project = () => props.story.project_id ? data.getProjectById(props.story.project_id) : null;
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
        try { await api.stories.removeAssignee(props.story.id, userId); } catch {}
      } else {
        setAssigneeId('');
        await saveImmediate({ assignee_id: null });
      }
      return;
    }

    if (assigned.has(userId)) {
      setAssigneeIds(prev => prev.filter(id => id !== userId));
      try { await api.stories.removeAssignee(props.story.id, userId); } catch {}
    } else {
      setAssigneeIds(prev => [...prev, userId]);
      try { await api.stories.addAssignee(props.story.id, userId); } catch {}
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
      class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={() => props.onClose()}
    >
      <div
        class="bg-base-100 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div class="sticky top-0 bg-base-100 z-10 px-4 sm:px-5 pt-3.5 pb-2.5 border-b border-base-content/[0.06]">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
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
                  </Show>
                  <Show when={saveStatus() === 'saved'}>
                    <Check size={11} class="text-ios-green-500" />
                  </Show>
                </span>
              </Show>
            </div>
            <button onClick={() => props.onClose()} class="p-2 rounded-lg hover:bg-base-content/10 transition-colors shrink-0 ml-2">
              <X size={18} class="text-base-content/40" />
            </button>
          </div>
        </div>

        <div class="px-4 sm:px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 space-y-3">

          {/* Title — editable */}
          <textarea
            value={title()}
            rows={1}
            class="w-full text-lg font-bold leading-snug bg-transparent resize-none outline-none rounded-lg px-1.5 py-1 -mx-1.5 border border-transparent focus:border-base-content/10 focus:bg-base-content/[0.02] transition-colors placeholder:text-base-content/20"
            placeholder="Título de la historia"
            ref={(el) => { requestAnimationFrame(() => autoResize(el)); }}
            onInput={(e) => {
              const val = e.currentTarget.value;
              setTitle(val);
              autoResize(e.currentTarget);
              if (val.trim()) scheduleSave({ title: val });
            }}
          />

          {/* Meta row: date + estimate + assignees — all inline */}
          <div class="flex items-center gap-2 flex-wrap">
            {/* Due date */}
            <label class="flex items-center gap-1.5 text-[11px] sm:text-[10px] px-2.5 py-1.5 rounded-lg bg-base-content/5 text-base-content/40 hover:bg-base-content/8 transition-colors cursor-pointer relative">
              <Calendar size={11} />
              <Show when={dueDate()} fallback={<span class="text-base-content/20">Fecha</span>}>
                <span>{formatDateDisplay(dueDate())}</span>
                <button
                  onClick={(e) => { e.preventDefault(); setDueDate(''); saveImmediate({ due_date: null }); }}
                  class="ml-0.5 p-0.5 rounded hover:bg-base-content/10 text-base-content/25 hover:text-base-content/50"
                >
                  <X size={8} />
                </button>
              </Show>
              <input type="date" value={dueDate()} class="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => { const val = e.currentTarget.value; setDueDate(val); saveImmediate({ due_date: val || null }); }} />
            </label>

            {/* Estimate */}
            <div class="relative">
              <button
                onClick={() => setShowEstimatePicker(!showEstimatePicker())}
                class="flex items-center gap-1.5 text-[11px] sm:text-[10px] px-2.5 py-1.5 rounded-lg bg-base-content/5 text-base-content/40 hover:bg-base-content/8 transition-colors"
              >
                <Show when={estimate() > 0 && getEstimate(estimate())} fallback={<span class="text-base-content/20">Estimar</span>}>
                  {(() => { const e = getEstimate(estimate())!; return <><span>{e.emoji}</span><span>{e.value}</span></>; })()}
                </Show>
              </button>
              <Show when={showEstimatePicker()}>
                <div class="absolute top-full left-0 mt-1 z-20 bg-base-100 rounded-xl border border-base-content/[0.06] shadow-lg shadow-black/20 p-1 min-w-[150px]">
                  <For each={estimates}>
                    {(e) => (
                      <button
                        onClick={() => { setEstimate(e.value); setShowEstimatePicker(false); saveImmediate({ estimate: e.value }); }}
                        class={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                          estimate() === e.value ? 'bg-ios-blue-500/10 text-ios-blue-500' : 'hover:bg-base-content/5 text-base-content/60'
                        }`}
                      >
                        <span>{e.emoji}</span>
                        <span class="text-[10px] font-mono text-base-content/30">{e.value}</span>
                        <span>{e.label}</span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Divider */}
            <div class="w-px h-4 bg-base-content/[0.06]" />

            {/* Inline assignees */}
            <div class="flex items-center gap-1.5">
              <Show when={currentAssignee()}>
                <img src={currentAssignee()!.avatar_url!} alt="" class="w-5 h-5 rounded-full ring-1 ring-base-content/[0.06]" title={currentAssignee()!.name} />
              </Show>
              <For each={extraAssigneeUsers()}>
                {(u) => (
                  <img src={u.avatar_url!} alt="" class="w-5 h-5 rounded-full ring-1 ring-base-content/[0.06] -ml-1" title={u.name} />
                )}
              </For>
              <button
                onClick={() => setShowAssigneePicker(!showAssigneePicker())}
                class="w-5 h-5 rounded-full flex items-center justify-center text-base-content/20 hover:text-ios-blue-500 hover:bg-ios-blue-500/10 transition-colors border border-dashed border-base-content/10"
                title="Asignar"
              >
                <UserPlus size={10} />
              </button>
            </div>
          </div>

          {/* Assignee picker — collapsible */}
          <Show when={showAssigneePicker()}>
            <div class="rounded-xl border border-base-content/[0.06] bg-base-content/[0.02] p-1 flex flex-wrap gap-0.5">
              <For each={activeMembers()}>
                {(member) => {
                  const isAssigned = () => allAssignedIds().has(member.id);
                  return (
                    <button
                      onClick={() => toggleAssignee(member.id)}
                      class={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        isAssigned() ? 'bg-ios-blue-500/10 text-ios-blue-500' : 'hover:bg-base-content/5 text-base-content/50'
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

          {/* Purpose + Description — 2-col on desktop */}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <section class="space-y-1">
              <div class="flex items-center gap-1.5">
                <HelpCircle size={11} class="text-base-content/20" />
                <h3 class="text-[9px] font-bold uppercase tracking-wider text-base-content/20">¿Para qué?</h3>
              </div>
              <textarea
                value={purpose()}
                rows={1}
                class="w-full text-[16px] sm:text-[13px] text-base-content/70 leading-relaxed bg-transparent resize-none outline-none rounded-lg px-2 py-1 border border-transparent focus:border-base-content/10 focus:bg-base-content/[0.02] transition-colors placeholder:text-base-content/15"
                placeholder="Propósito..."
                ref={(el) => { requestAnimationFrame(() => autoResize(el)); }}
                onInput={(e) => { const val = e.currentTarget.value; setPurpose(val); autoResize(e.currentTarget); scheduleSave({ purpose: val }); }}
              />
            </section>

            <section class="space-y-1">
              <div class="flex items-center gap-1.5">
                <FileText size={11} class="text-base-content/20" />
                <h3 class="text-[9px] font-bold uppercase tracking-wider text-base-content/20">Descripción</h3>
              </div>
              <Show
                when={editingDesc()}
                fallback={
                  <div
                    onClick={() => setEditingDesc(true)}
                    class="w-full text-[16px] sm:text-[13px] text-base-content/70 leading-relaxed rounded-lg px-2 py-1 border border-transparent hover:border-base-content/10 hover:bg-base-content/[0.02] transition-colors whitespace-pre-wrap cursor-text min-h-[28px]"
                  >
                    <Show when={description()} fallback={<span class="text-base-content/15">Descripción...</span>}>
                      <Linkify text={description()} />
                    </Show>
                  </div>
                }
              >
                <textarea
                  value={description()}
                  rows={1}
                  class="w-full text-[16px] sm:text-[13px] text-base-content/70 leading-relaxed bg-transparent resize-none outline-none rounded-lg px-2 py-1 border border-base-content/10 bg-base-content/[0.02] transition-colors whitespace-pre-wrap placeholder:text-base-content/15"
                  placeholder="Descripción..."
                  ref={(el) => { requestAnimationFrame(() => { autoResize(el); el.focus(); }); }}
                  onInput={(e) => { const val = e.currentTarget.value; setDescription(val); autoResize(e.currentTarget); scheduleSave({ description: val }); }}
                  onBlur={() => setEditingDesc(false)}
                />
              </Show>
            </section>
          </div>

          {/* Objective */}
          <section class="space-y-1">
            <div class="flex items-center gap-1.5">
              <Target size={11} class="text-base-content/20" />
              <h3 class="text-[9px] font-bold uppercase tracking-wider text-base-content/20">Objetivo</h3>
            </div>
            <textarea
              value={objective()}
              rows={1}
              class="w-full text-[16px] sm:text-[13px] font-medium bg-transparent resize-none outline-none rounded-lg px-2 py-1 border border-transparent focus:border-base-content/10 focus:bg-base-content/[0.02] transition-colors placeholder:text-base-content/15"
              placeholder="Objetivo..."
              ref={(el) => { requestAnimationFrame(() => autoResize(el)); }}
              onInput={(e) => { const val = e.currentTarget.value; setObjective(val); autoResize(e.currentTarget); scheduleSave({ objective: val }); }}
            />
          </section>

          {/* Acceptance Criteria */}
          <Show when={criteria().length > 0}>
            <section class="space-y-2">
              <div class="flex items-center gap-1.5">
                <ClipboardCheck size={11} class="text-base-content/20" />
                <h3 class="text-[9px] font-bold uppercase tracking-wider text-base-content/20">
                  Criterios
                </h3>
                <span class="text-[9px] text-base-content/15">{metCount()}/{criteria().length}</span>
                <div class="flex-1 h-1 bg-base-content/5 rounded-full overflow-hidden ml-1">
                  <div
                    class="h-full bg-ios-green-500 rounded-full transition-all duration-300"
                    style={{ width: `${(metCount() / criteria().length) * 100}%` }}
                  />
                </div>
              </div>
              <div class="space-y-0.5">
                <For each={criteria()}>
                  {(c) => (
                    <button
                      class="flex items-start gap-2 py-1.5 sm:py-1 px-2 -ml-2 rounded-lg w-full text-left hover:bg-base-content/5 active:bg-base-content/10 transition-colors group"
                      onClick={async () => {
                        const newVal = !c.is_met;
                        setCriteriaList(prev => prev.map(item => item.id === c.id ? { ...item, is_met: newVal } : item));
                        try { await api.stories.updateCriteria(props.story.id, c.id, { is_met: newVal }); }
                        catch { setCriteriaList(prev => prev.map(item => item.id === c.id ? { ...item, is_met: !newVal } : item)); }
                      }}
                    >
                      <Show
                        when={c.is_met}
                        fallback={<Circle size={14} class="text-base-content/15 mt-px shrink-0 group-hover:text-base-content/30 transition-colors" />}
                      >
                        <CheckCircle size={14} class="text-ios-green-500 mt-px shrink-0" />
                      </Show>
                      <span class={`text-[13px] leading-snug transition-colors ${c.is_met ? 'text-base-content/30 line-through' : 'text-base-content/70'}`}>
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
            <AttachmentSection
              storyId={props.story.id}
              onReady={(fn) => { attachmentUploadRef = fn; }}
            />
          </Show>

          {/* Delete */}
          <div class="pt-2 mt-1 border-t border-base-content/[0.04]">
            <Show when={deleteError()}>
              <p class="text-xs text-red-500 mb-2">{deleteError()}</p>
            </Show>
            <Show
              when={confirming()}
              fallback={
                <button
                  onClick={() => setConfirming(true)}
                  class="flex items-center gap-1.5 text-[11px] text-base-content/20 hover:text-red-500 transition-colors py-1"
                >
                  <Trash2 size={12} />
                  Eliminar
                </button>
              }
            >
              <div class="flex items-center gap-2">
                <span class="text-[11px] text-red-500">¿Eliminar?</span>
                <button onClick={() => setConfirming(false)} disabled={deleting()}
                  class="text-[11px] px-3 py-1.5 rounded-lg bg-base-content/5 text-base-content/50 hover:bg-base-content/10 transition-colors">
                  No
                </button>
                <button onClick={handleDelete} disabled={deleting()}
                  class="text-[11px] px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50">
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
