import { createEffect, createSignal, For, Show, batch, type Component } from 'solid-js';
import { ArrowUp, CalendarDays, Check, ChevronDown, ChevronUp, FolderKanban, UserCircle, X } from 'lucide-solid';
import { useAuth } from '../../lib/auth';
import { useData } from '../../lib/data';
import { api } from '../../lib/api';
import { toLocalDateStr } from '../../lib/recurrence';

interface MobileQuickAddSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const MobileQuickAddSheet: Component<MobileQuickAddSheetProps> = (props) => {
  const auth = useAuth();
  const data = useData();

  const [title, setTitle] = createSignal('');
  const [selectedProject, setSelectedProject] = createSignal<string | null>(null);
  const [selectedDate, setSelectedDate] = createSignal<string | null>(null);
  const [selectedAssignee, setSelectedAssignee] = createSignal<string | null>(null);
  const [showAssigneePicker, setShowAssigneePicker] = createSignal(false);
  const [creating, setCreating] = createSignal(false);

  let inputRef!: HTMLInputElement;
  let dateInputRef!: HTMLInputElement;

  createEffect(() => {
    if (props.open) {
      setTimeout(() => inputRef?.focus(), 40);
    }
  });

  const activeProjects = () => data.projects().filter(project => project.status === 'active');
  const activeMembers = () => data.users().filter(user => user.is_active);
  const currentUser = () => auth.user();
  const selectedAssigneeUser = () =>
    selectedAssignee() ? data.getUserById(selectedAssignee()!) : currentUser();

  const todayStr = () => toLocalDateStr(new Date());
  const tomorrowStr = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return toLocalDateStr(date);
  };
  const nextMondayStr = () => {
    const date = new Date();
    const day = date.getDay();
    const offset = day === 0 ? 1 : 8 - day;
    date.setDate(date.getDate() + offset);
    return toLocalDateStr(date);
  };

  const formatDateChip = (dateStr: string) => {
    if (dateStr === todayStr()) return 'Hoy';
    if (dateStr === tomorrowStr()) return 'Mañana';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  const reset = () => {
    batch(() => {
      setTitle('');
      setSelectedProject(null);
      setSelectedDate(null);
      setSelectedAssignee(null);
      setShowAssigneePicker(false);
    });
  };

  const handleCreate = async () => {
    const trimmed = title().trim();
    if (!trimmed || creating()) return;

    setCreating(true);
    try {
      await api.stories.create({
        title: trimmed,
        status: 'todo',
        priority: 'medium',
        category: 'today',
        project_id: selectedProject() || undefined,
        due_date: selectedDate() || undefined,
        assignee_id: selectedAssignee() || auth.user()?.id,
      });
      navigator.vibrate?.(10);
      reset();
      props.onCreated();
      props.onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[180] bg-black/50 backdrop-blur-sm" onClick={props.onClose} />
      <div class="sm:hidden fixed inset-x-0 bottom-0 z-[190] px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div class="mx-auto max-w-lg overflow-hidden rounded-[30px] border border-base-content/[0.08] bg-base-200/95 backdrop-blur-3xl shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <div class="flex items-center justify-between px-4 pt-4 pb-2">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/25">Crear rápido</p>
              <h2 class="text-lg font-semibold text-base-content/90">Nueva tarea</h2>
            </div>
            <button
              onClick={props.onClose}
              class="w-9 h-9 rounded-full bg-base-content/[0.04] text-base-content/35 flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>

          <div class="px-4 pb-4 space-y-4">
            <div class="rounded-2xl border border-base-content/[0.08] bg-base-100/30 px-4 py-3">
              <input
                ref={inputRef}
                value={title()}
                onInput={(event) => setTitle(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="Agregar una tarea..."
                class="w-full bg-transparent text-[16px] font-medium text-base-content/85 outline-none placeholder:text-base-content/25"
              />
            </div>

            <div class="rounded-2xl border border-base-content/[0.08] bg-base-100/25 p-3 space-y-4">
              <section class="space-y-2">
                <div class="flex items-center gap-2 px-1">
                  <FolderKanban size={12} class="text-base-content/20 shrink-0" />
                  <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/25">Proyecto</span>
                </div>
                <div class="grid grid-cols-3 gap-2">
                  <For each={activeProjects()}>
                    {(project) => (
                      <button
                        onClick={() => setSelectedProject(current => current === project.id ? null : project.id)}
                        class={`min-w-0 rounded-2xl px-2.5 py-2 text-left transition-all ${
                          selectedProject() === project.id
                            ? 'shadow-sm'
                            : 'bg-base-content/[0.04] text-base-content/55'
                        }`}
                        style={selectedProject() === project.id ? {
                          "background-color": `${project.color}16`,
                          color: project.color,
                          "box-shadow": `inset 0 0 0 1px ${project.color}33`,
                        } : undefined}
                      >
                        <div class="flex items-center gap-1.5">
                          <div class="w-2 h-2 rounded-full shrink-0" style={{ "background-color": project.color }} />
                          <span class="text-[11px] font-bold truncate">{project.prefix}</span>
                        </div>
                        <span class="block mt-1 text-[9px] font-medium truncate opacity-75">{project.name}</span>
                      </button>
                    )}
                  </For>
                </div>
              </section>

              <section class="space-y-2">
                <div class="flex items-center gap-2 px-1">
                  <CalendarDays size={12} class="text-base-content/20 shrink-0" />
                  <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/25">Fecha</span>
                </div>
                <div class="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Hoy', value: todayStr() },
                    { label: 'Mañana', value: tomorrowStr() },
                    { label: 'Lunes', value: nextMondayStr() },
                  ].map(option => (
                    <button
                      onClick={() => setSelectedDate(current => current === option.value ? null : option.value)}
                      class={`rounded-2xl px-2 py-2 text-[11px] font-semibold transition-all ${
                        selectedDate() === option.value
                          ? 'bg-ios-blue-500/15 text-ios-blue-500 ring-1 ring-ios-blue-500/30'
                          : 'bg-base-content/[0.04] text-base-content/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    onClick={() => dateInputRef?.showPicker?.()}
                    class={`rounded-2xl px-2 py-2 text-[11px] font-semibold transition-all ${
                      selectedDate() && ![todayStr(), tomorrowStr(), nextMondayStr()].includes(selectedDate()!)
                        ? 'bg-ios-blue-500/15 text-ios-blue-500 ring-1 ring-ios-blue-500/30'
                        : 'bg-base-content/[0.04] text-base-content/50'
                    }`}
                  >
                    {selectedDate() && ![todayStr(), tomorrowStr(), nextMondayStr()].includes(selectedDate()!)
                      ? formatDateChip(selectedDate()!)
                      : 'Otra...'}
                  </button>
                </div>
                <input
                  ref={dateInputRef}
                  type="date"
                  class="sr-only"
                  onChange={(event) => {
                    if (event.currentTarget.value) setSelectedDate(event.currentTarget.value);
                  }}
                />
              </section>

              <section class="space-y-2">
                <div class="flex items-center gap-2 px-1">
                  <UserCircle size={12} class="text-base-content/20 shrink-0" />
                  <span class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/25">Asignación</span>
                </div>

                <button
                  onClick={() => {
                    setSelectedAssignee(null);
                    setShowAssigneePicker(false);
                  }}
                  class={`w-full rounded-2xl px-3 py-2.5 text-left transition-all ${
                    !selectedAssignee()
                      ? 'bg-ios-blue-500/14 text-ios-blue-500 ring-1 ring-ios-blue-500/25'
                      : 'bg-base-content/[0.04] text-base-content/60'
                  }`}
                >
                  <div class="flex items-center gap-3">
                    <Show
                      when={currentUser()?.avatar_url}
                      fallback={
                        <div class="w-9 h-9 rounded-full bg-ios-blue-500/15 text-ios-blue-500 flex items-center justify-center text-[10px] font-bold uppercase">
                          {currentUser()?.name.slice(0, 2)}
                        </div>
                      }
                    >
                      <img
                        src={currentUser()!.avatar_url!}
                        alt=""
                        class={`w-9 h-9 rounded-full object-cover ${!selectedAssignee() ? 'ring-2 ring-ios-blue-500/45' : 'ring-1 ring-base-content/[0.06]'}`}
                      />
                    </Show>
                    <div class="min-w-0 flex-1">
                      <p class="text-[12px] font-semibold">Asignarme</p>
                      <p class="text-[10px] opacity-70">Se crea para {currentUser()?.name.split(' ')[0] ?? 'ti'}</p>
                    </div>
                    <Show when={!selectedAssignee()}>
                      <Check size={14} class="shrink-0" />
                    </Show>
                  </div>
                </button>

                <button
                  onClick={() => setShowAssigneePicker(open => !open)}
                  class={`w-full rounded-2xl px-3 py-2.5 text-left transition-all ${
                    selectedAssignee()
                      ? 'bg-base-content/[0.06] text-base-content'
                      : 'bg-base-content/[0.04] text-base-content/60'
                  }`}
                >
                  <div class="flex items-center gap-3">
                    <Show
                      when={selectedAssigneeUser()?.avatar_url}
                      fallback={
                        <div class="w-9 h-9 rounded-full bg-base-content/10 text-base-content/45 flex items-center justify-center text-[10px] font-bold uppercase">
                          {selectedAssigneeUser()?.name.slice(0, 2)}
                        </div>
                      }
                    >
                      <img
                        src={selectedAssigneeUser()!.avatar_url!}
                        alt=""
                        class={`w-9 h-9 rounded-full object-cover ${selectedAssignee() ? 'ring-2 ring-base-content/20' : 'ring-1 ring-base-content/[0.06]'}`}
                      />
                    </Show>
                    <div class="min-w-0 flex-1">
                      <p class="text-[12px] font-semibold">
                        {selectedAssignee() ? selectedAssigneeUser()?.name : 'Elegir otra persona'}
                      </p>
                      <p class="text-[10px] opacity-70">
                        {selectedAssignee() ? 'Asignación manual seleccionada' : 'Opcional'}
                      </p>
                    </div>
                    <Show when={showAssigneePicker()} fallback={<ChevronDown size={14} class="shrink-0 opacity-60" />}>
                      <ChevronUp size={14} class="shrink-0 opacity-60" />
                    </Show>
                  </div>
                </button>

                <Show when={showAssigneePicker()}>
                  <div class="grid grid-cols-4 gap-2 rounded-2xl bg-base-content/[0.03] p-2">
                    <For each={activeMembers().filter(member => member.id !== currentUser()?.id)}>
                      {(member) => {
                        const selected = () => selectedAssignee() === member.id;
                        return (
                          <button
                            onClick={() => setSelectedAssignee(current => current === member.id ? null : member.id)}
                            class="min-w-0 flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-all active:scale-95"
                          >
                            <Show
                              when={member.avatar_url}
                              fallback={
                                <div class={`w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-bold uppercase ${
                                  selected()
                                    ? 'bg-ios-blue-500/15 text-ios-blue-500 ring-2 ring-ios-blue-500/40'
                                    : 'bg-base-content/10 text-base-content/40 ring-1 ring-base-content/[0.06]'
                                }`}>
                                  {member.name.slice(0, 2)}
                                </div>
                              }
                            >
                              <img
                                src={member.avatar_url!}
                                alt=""
                                class={`w-10 h-10 rounded-full object-cover ${
                                  selected() ? 'ring-2 ring-ios-blue-500/50' : 'ring-1 ring-base-content/[0.06]'
                                }`}
                              />
                            </Show>
                            <span class={`w-full truncate text-center text-[9px] font-semibold ${
                              selected() ? 'text-ios-blue-500' : 'text-base-content/35'
                            }`}>
                              {member.name.split(' ')[0]}
                            </span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </section>
            </div>

            <button
              onClick={handleCreate}
              disabled={!title().trim() || creating()}
              class="w-full flex items-center justify-center gap-2 rounded-2xl bg-ios-blue-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-ios-blue-500/20 transition-all active:scale-[0.99] disabled:opacity-50"
            >
              <ArrowUp size={16} />
              {creating() ? 'Creando...' : 'Crear tarea'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default MobileQuickAddSheet;
