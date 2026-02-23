import { createSignal, createResource, For, Show, type Component } from 'solid-js';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { api } from '../lib/api';
import {
  Users, FolderKanban, Plus, Pencil, Shield,
  ChevronDown, ChevronRight, UserIcon, Archive, Send,
  Flag, CalendarDays, Copy, Check, RefreshCw,
} from 'lucide-solid';
import MemberModal from '../components/MemberModal';
import ProjectModal from '../components/ProjectModal';
import CreateAssignmentModal from '../components/CreateAssignmentModal';
import RecurringStoryModal from '../components/RecurringStoryModal';
import { frequencyLabel, isRecurring } from '../lib/recurrence';
import type { User, Project, Assignment, Story } from '../types';

type AdminTab = 'team' | 'projects' | 'assignments' | 'recurring';

const AdminPage: Component = () => {
  const auth = useAuth();
  const data = useData();
  const [activeTab, setActiveTab] = createSignal<AdminTab>('team');
  const [showMemberModal, setShowMemberModal] = createSignal(false);
  const [editingMember, setEditingMember] = createSignal<User | undefined>();
  const [showProjectModal, setShowProjectModal] = createSignal(false);
  const [editingProject, setEditingProject] = createSignal<Project | undefined>();
  const [showAssignmentModal, setShowAssignmentModal] = createSignal(false);
  const [editingAssignment, setEditingAssignment] = createSignal<Assignment | undefined>();
  const [showRecurringModal, setShowRecurringModal] = createSignal(false);
  const [editingRecurring, setEditingRecurring] = createSignal<Story | undefined>();
  const [showInactive, setShowInactive] = createSignal(false);
  const [showInactiveRecurring, setShowInactiveRecurring] = createSignal(false);
  const [showArchived, setShowArchived] = createSignal(false);
  const [showClosed, setShowClosed] = createSignal(false);
  const [copiedId, setCopiedId] = createSignal<string | null>(null);

  const copyEmail = (e: MouseEvent, member: User) => {
    e.stopPropagation();
    navigator.clipboard.writeText(member.email);
    setCopiedId(member.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Assignments resource
  const [assignmentsList, { refetch: refetchAssignments }] = createResource(
    () => true,
    () => api.assignments.list(),
  );

  // Recurring stories resource
  const [recurringList, { refetch: refetchRecurring }] = createResource(
    () => true,
    async () => {
      const all = await api.stories.list();
      return (all as Story[]).filter(s => isRecurring(s));
    },
  );

  const activeRecurring = () => (recurringList() ?? []).filter(s => s.is_active);
  const inactiveRecurring = () => (recurringList() ?? []).filter(s => !s.is_active);

  const openAssignments = () => (assignmentsList() ?? []).filter(a => a.status === 'open');
  const closedAssignments = () => (assignmentsList() ?? []).filter(a => a.status === 'closed');

  const activeMembers = () => data.users().filter(u => u.is_active);
  const inactiveMembers = () => data.users().filter(u => !u.is_active);
  const activeProjects = () => data.projects().filter(p => p.status === 'active');
  const archivedProjects = () => data.projects().filter(p => p.status === 'archived');

  const openCreateMember = () => {
    setEditingMember(undefined);
    setShowMemberModal(true);
  };

  const openEditMember = (member: User) => {
    setEditingMember(member);
    setShowMemberModal(true);
  };

  const openCreateProject = () => {
    setEditingProject(undefined);
    setShowProjectModal(true);
  };

  const openEditProject = (project: Project) => {
    setEditingProject(project);
    setShowProjectModal(true);
  };

  const openCreateAssignment = () => {
    setEditingAssignment(undefined);
    setShowAssignmentModal(true);
  };

  const openEditAssignment = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setShowAssignmentModal(true);
  };

  const openCreateRecurring = () => {
    setEditingRecurring(undefined);
    setShowRecurringModal(true);
  };

  const openEditRecurring = (story: Story) => {
    setEditingRecurring(story);
    setShowRecurringModal(true);
  };

  const handleMemberSaved = () => {
    data.refetchUsers();
  };

  const handleProjectSaved = () => {
    data.refetchProjects();
  };

  const handleDeleteProject = async (project: Project) => {
    try {
      await api.projects.delete(project.id);
      data.refetchProjects();
    } catch { /* ignore */ }
  };

  const getAssignee = (userId: string) => data.getUserById(userId);
  const getProject = (projectId: string | null) => projectId ? data.getProjectById(projectId) : null;

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  return (
    <>
      <div class="space-y-4">
        {/* Header */}
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-bold">Administración</h1>
        </div>

        {/* Tab Selector */}
        <div class="flex gap-1 p-1 rounded-xl bg-base-content/[0.04]">
          <button
            onClick={() => setActiveTab('team')}
            class={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab() === 'team'
                ? 'bg-base-100 text-base-content shadow-sm'
                : 'text-base-content/40 hover:text-base-content/60'
            }`}
          >
            <Users size={14} />
            Equipo
            <span class="text-[10px] opacity-50">{data.users().length}</span>
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            class={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab() === 'projects'
                ? 'bg-base-100 text-base-content shadow-sm'
                : 'text-base-content/40 hover:text-base-content/60'
            }`}
          >
            <FolderKanban size={14} />
            Proyectos
            <span class="text-[10px] opacity-50">{data.projects().length}</span>
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            class={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab() === 'assignments'
                ? 'bg-base-100 text-base-content shadow-sm'
                : 'text-base-content/40 hover:text-base-content/60'
            }`}
          >
            <Send size={14} />
            <span class="hidden sm:inline">Encomiendas</span>
            <span class="sm:hidden">Encom.</span>
            <span class="text-[10px] opacity-50">{openAssignments().length}</span>
          </button>
          <button
            onClick={() => setActiveTab('recurring')}
            class={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab() === 'recurring'
                ? 'bg-base-100 text-base-content shadow-sm'
                : 'text-base-content/40 hover:text-base-content/60'
            }`}
          >
            <RefreshCw size={14} />
            <span class="hidden sm:inline">Recurrentes</span>
            <span class="sm:hidden">Recur.</span>
            <span class="text-[10px] opacity-50">{activeRecurring().length}</span>
          </button>
        </div>

        {/* ─── Team Section ─── */}
        <Show when={activeTab() === 'team'}>
          <div class="space-y-3 stagger-in">
            <button
              onClick={openCreateMember}
              class="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-base-content/[0.08] text-ios-blue-500 text-xs font-medium hover:bg-ios-blue-500/5 hover:border-ios-blue-500/20 transition-all"
            >
              <Plus size={14} />
              Agregar miembro
            </button>

            <div class="space-y-1">
              <For each={activeMembers()}>
                {(member) => {
                  const isMe = () => member.id === auth.user()?.id;
                  return (
                    <div
                      class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-base-200/30 hover:bg-base-200/50 transition-colors group cursor-pointer"
                      onClick={() => openEditMember(member)}
                    >
                      <Show
                        when={member.avatar_url}
                        fallback={
                          <div class="w-9 h-9 rounded-full bg-base-content/10 flex items-center justify-center text-xs font-bold text-base-content/30 shrink-0">
                            {member.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                        }
                      >
                        <img src={member.avatar_url!} alt="" class="w-9 h-9 rounded-full object-cover shrink-0" />
                      </Show>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5">
                          <p class="text-sm font-medium truncate">{member.name}</p>
                          <Show when={isMe()}>
                            <span class="text-[8px] px-1 py-px rounded bg-ios-blue-500/15 text-ios-blue-500 shrink-0">tú</span>
                          </Show>
                        </div>
                        <p class="text-[11px] text-base-content/30 truncate">{member.email}</p>
                      </div>
                      <div class="flex items-center gap-1.5 shrink-0">
                        <span class={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${
                          member.role === 'admin'
                            ? 'bg-amber-500/15 text-amber-500'
                            : 'bg-base-content/[0.06] text-base-content/30'
                        }`}>
                          {member.role === 'admin' ? 'Admin' : 'Colab'}
                        </span>
                        <button
                          onClick={(e) => copyEmail(e, member)}
                          class={`p-1.5 rounded-lg transition-all duration-200 ${
                            copiedId() === member.id
                              ? 'bg-ios-green-500/15 text-ios-green-500'
                              : 'text-base-content/15 opacity-0 group-hover:opacity-100 hover:bg-base-content/5 hover:text-base-content/40'
                          }`}
                          title={`Copiar ${member.email}`}
                        >
                          <Show when={copiedId() === member.id} fallback={<Copy size={13} />}>
                            <Check size={13} />
                          </Show>
                        </button>
                        <Pencil size={13} class="text-base-content/15 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>

            <Show when={inactiveMembers().length > 0}>
              <div class="space-y-1">
                <button
                  onClick={() => setShowInactive(!showInactive())}
                  class="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-base-content/25 tracking-wider hover:text-base-content/40 transition-colors"
                >
                  <Show when={showInactive()} fallback={<ChevronRight size={12} />}>
                    <ChevronDown size={12} />
                  </Show>
                  Inactivos ({inactiveMembers().length})
                </button>
                <Show when={showInactive()}>
                  <For each={inactiveMembers()}>
                    {(member) => (
                      <div
                        class="flex items-center gap-3 px-3 py-2 rounded-xl bg-base-200/20 hover:bg-base-200/30 transition-colors opacity-50 cursor-pointer"
                        onClick={() => openEditMember(member)}
                      >
                        <Show
                          when={member.avatar_url}
                          fallback={
                            <div class="w-9 h-9 rounded-full bg-base-content/5 flex items-center justify-center text-xs font-bold text-base-content/20 shrink-0">
                              {member.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                          }
                        >
                          <img src={member.avatar_url!} alt="" class="w-9 h-9 rounded-full object-cover shrink-0 grayscale" />
                        </Show>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium truncate">{member.name}</p>
                          <p class="text-[11px] text-base-content/20 truncate">{member.email}</p>
                        </div>
                        <button
                          onClick={(e) => copyEmail(e, member)}
                          class={`p-1.5 rounded-lg transition-all duration-200 shrink-0 ${
                            copiedId() === member.id
                              ? 'bg-ios-green-500/15 text-ios-green-500'
                              : 'text-base-content/15 hover:bg-base-content/5 hover:text-base-content/40'
                          }`}
                          title={`Copiar ${member.email}`}
                        >
                          <Show when={copiedId() === member.id} fallback={<Copy size={13} />}>
                            <Check size={13} />
                          </Show>
                        </button>
                        <span class="text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-red-500/10 text-red-400 shrink-0">Inactivo</span>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>
          </div>
        </Show>

        {/* ─── Projects Section ─── */}
        <Show when={activeTab() === 'projects'}>
          <div class="space-y-3 stagger-in">
            <button
              onClick={openCreateProject}
              class="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-base-content/[0.08] text-ios-blue-500 text-xs font-medium hover:bg-ios-blue-500/5 hover:border-ios-blue-500/20 transition-all"
            >
              <Plus size={14} />
              Nuevo proyecto
            </button>

            <div class="space-y-1">
              <For each={activeProjects()}>
                {(project) => {
                  const creator = () => data.getUserById(project.created_by);
                  return (
                    <div
                      class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-base-200/30 hover:bg-base-200/50 transition-colors group cursor-pointer"
                      onClick={() => openEditProject(project)}
                    >
                      <div
                        class="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
                        style={{ background: project.color }}
                      >
                        {project.prefix.slice(0, 2)}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate">{project.name}</p>
                        <p class="text-[11px] text-base-content/30">
                          {project.prefix} · creado por {creator()?.name?.split(' ')[0] ?? '...'}
                        </p>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <span class="text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-ios-green-500/15 text-ios-green-500">Activo</span>
                        <Pencil size={13} class="text-base-content/15 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>

            <Show when={archivedProjects().length > 0}>
              <div class="space-y-1">
                <button
                  onClick={() => setShowArchived(!showArchived())}
                  class="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-base-content/25 tracking-wider hover:text-base-content/40 transition-colors"
                >
                  <Show when={showArchived()} fallback={<ChevronRight size={12} />}>
                    <ChevronDown size={12} />
                  </Show>
                  Archivados ({archivedProjects().length})
                </button>
                <Show when={showArchived()}>
                  <For each={archivedProjects()}>
                    {(project) => (
                      <div
                        class="flex items-center gap-3 px-3 py-2 rounded-xl bg-base-200/20 hover:bg-base-200/30 transition-colors opacity-50 cursor-pointer"
                        onClick={() => openEditProject(project)}
                      >
                        <div
                          class="w-9 h-9 rounded-lg flex items-center justify-center text-white/60 font-bold text-xs shrink-0 grayscale"
                          style={{ background: project.color }}
                        >
                          {project.prefix.slice(0, 2)}
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium truncate">{project.name}</p>
                          <p class="text-[11px] text-base-content/20">{project.prefix}</p>
                        </div>
                        <span class="text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-orange-500/10 text-orange-400 shrink-0">
                          <Archive size={10} class="inline mr-0.5" />
                          Archivado
                        </span>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>
          </div>
        </Show>

        {/* ─── Assignments Section ─── */}
        <Show when={activeTab() === 'assignments'}>
          <div class="space-y-3 stagger-in">
            <button
              onClick={openCreateAssignment}
              class="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-base-content/[0.08] text-purple-500 text-xs font-medium hover:bg-purple-500/5 hover:border-purple-500/20 transition-all"
            >
              <Plus size={14} />
              Nueva encomienda
            </button>

            {/* Open assignments */}
            <div class="space-y-1">
              <Show when={openAssignments().length === 0 && !assignmentsList.loading}>
                <div class="text-center py-8 text-base-content/20 text-xs">
                  Sin encomiendas abiertas
                </div>
              </Show>
              <For each={openAssignments()}>
                {(assignment) => {
                  const assignee = () => getAssignee(assignment.assigned_to);
                  const project = () => getProject(assignment.project_id);
                  const due = () => formatDueDate(assignment.due_date);
                  return (
                    <div
                      class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-base-200/30 hover:bg-base-200/50 transition-colors group cursor-pointer"
                      onClick={() => openEditAssignment(assignment)}
                    >
                      <Show
                        when={assignee()?.avatar_url}
                        fallback={
                          <div class="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center text-xs font-bold text-purple-500/40 shrink-0">
                            {assignee()?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? '?'}
                          </div>
                        }
                      >
                        <img src={assignee()!.avatar_url!} alt="" class="w-9 h-9 rounded-full object-cover shrink-0" />
                      </Show>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate">{assignment.title}</p>
                        <div class="flex items-center gap-2 mt-0.5">
                          <span class="text-[11px] text-base-content/30 truncate">
                            → {assignee()?.name?.split(' ')[0] ?? '...'}
                          </span>
                          <Show when={project()}>
                            <span
                              class="text-[9px] px-1.5 py-px rounded font-medium text-white/80 shrink-0"
                              style={{ background: project()!.color }}
                            >
                              {project()!.prefix}
                            </span>
                          </Show>
                          <Show when={due()}>
                            <span class="flex items-center gap-0.5 text-[10px] text-base-content/25 shrink-0">
                              <CalendarDays size={9} />
                              {due()}
                            </span>
                          </Show>
                        </div>
                      </div>
                      <Pencil size={13} class="text-base-content/15 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  );
                }}
              </For>
            </div>

            {/* Closed assignments */}
            <Show when={closedAssignments().length > 0}>
              <div class="space-y-1">
                <button
                  onClick={() => setShowClosed(!showClosed())}
                  class="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-base-content/25 tracking-wider hover:text-base-content/40 transition-colors"
                >
                  <Show when={showClosed()} fallback={<ChevronRight size={12} />}>
                    <ChevronDown size={12} />
                  </Show>
                  Cerradas ({closedAssignments().length})
                </button>
                <Show when={showClosed()}>
                  <For each={closedAssignments()}>
                    {(assignment) => {
                      const assignee = () => getAssignee(assignment.assigned_to);
                      return (
                        <div
                          class="flex items-center gap-3 px-3 py-2 rounded-xl bg-base-200/20 hover:bg-base-200/30 transition-colors opacity-50 cursor-pointer"
                          onClick={() => openEditAssignment(assignment)}
                        >
                          <Show
                            when={assignee()?.avatar_url}
                            fallback={
                              <div class="w-9 h-9 rounded-full bg-base-content/5 flex items-center justify-center text-xs font-bold text-base-content/20 shrink-0">
                                {assignee()?.name?.[0] ?? '?'}
                              </div>
                            }
                          >
                            <img src={assignee()!.avatar_url!} alt="" class="w-9 h-9 rounded-full object-cover shrink-0 grayscale" />
                          </Show>
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium truncate line-through">{assignment.title}</p>
                            <span class="text-[11px] text-base-content/20">→ {assignee()?.name?.split(' ')[0] ?? '...'}</span>
                          </div>
                          <span class="text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-base-content/[0.06] text-base-content/30 shrink-0">Cerrada</span>
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </div>
            </Show>
          </div>
        </Show>

        {/* ─── Recurring Section ─── */}
        <Show when={activeTab() === 'recurring'}>
          <div class="space-y-3 stagger-in">
            <button
              onClick={openCreateRecurring}
              class="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-base-content/[0.08] text-purple-500 text-xs font-medium hover:bg-purple-500/5 hover:border-purple-500/20 transition-all"
            >
              <Plus size={14} />
              Nueva tarea recurrente
            </button>

            {/* Active recurring */}
            <div class="space-y-1">
              <Show when={activeRecurring().length === 0 && !recurringList.loading}>
                <div class="text-center py-8 text-base-content/20 text-xs">
                  Sin tareas recurrentes
                </div>
              </Show>
              <For each={activeRecurring()}>
                {(story) => {
                  const assignee = () => getAssignee(story.assignee_id ?? '');
                  const project = () => getProject(story.project_id);
                  return (
                    <div
                      class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-base-200/30 hover:bg-base-200/50 transition-colors group cursor-pointer"
                      onClick={() => openEditRecurring(story)}
                    >
                      <Show
                        when={assignee()?.avatar_url}
                        fallback={
                          <div class="w-9 h-9 rounded-full bg-purple-500/10 flex items-center justify-center text-xs font-bold text-purple-500/40 shrink-0">
                            {assignee()?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? '?'}
                          </div>
                        }
                      >
                        <img src={assignee()!.avatar_url!} alt="" class="w-9 h-9 rounded-full object-cover shrink-0" />
                      </Show>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate">{story.title}</p>
                        <div class="flex items-center gap-2 mt-0.5">
                          <span class="text-[11px] text-base-content/30 truncate">
                            → {assignee()?.name?.split(' ')[0] ?? '...'}
                          </span>
                          <span class="text-[9px] font-bold text-purple-500/60 bg-purple-500/10 px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-0.5">
                            <RefreshCw size={8} />
                            {frequencyLabel(story)}
                          </span>
                          <Show when={project()}>
                            <span
                              class="text-[9px] px-1.5 py-px rounded font-medium text-white/80 shrink-0"
                              style={{ background: project()!.color }}
                            >
                              {project()!.prefix}
                            </span>
                          </Show>
                        </div>
                      </div>
                      <Pencil size={13} class="text-base-content/15 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  );
                }}
              </For>
            </div>

            {/* Inactive recurring */}
            <Show when={inactiveRecurring().length > 0}>
              <div class="space-y-1">
                <button
                  onClick={() => setShowInactiveRecurring(!showInactiveRecurring())}
                  class="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-base-content/25 tracking-wider hover:text-base-content/40 transition-colors"
                >
                  <Show when={showInactiveRecurring()} fallback={<ChevronRight size={12} />}>
                    <ChevronDown size={12} />
                  </Show>
                  Inactivas ({inactiveRecurring().length})
                </button>
                <Show when={showInactiveRecurring()}>
                  <For each={inactiveRecurring()}>
                    {(story) => {
                      const assignee = () => getAssignee(story.assignee_id ?? '');
                      return (
                        <div
                          class="flex items-center gap-3 px-3 py-2 rounded-xl bg-base-200/20 hover:bg-base-200/30 transition-colors opacity-50 cursor-pointer"
                          onClick={() => openEditRecurring(story)}
                        >
                          <Show
                            when={assignee()?.avatar_url}
                            fallback={
                              <div class="w-9 h-9 rounded-full bg-base-content/5 flex items-center justify-center text-xs font-bold text-base-content/20 shrink-0">
                                {assignee()?.name?.[0] ?? '?'}
                              </div>
                            }
                          >
                            <img src={assignee()!.avatar_url!} alt="" class="w-9 h-9 rounded-full object-cover shrink-0 grayscale" />
                          </Show>
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium truncate">{story.title}</p>
                            <span class="text-[11px] text-base-content/20">→ {assignee()?.name?.split(' ')[0] ?? '...'}</span>
                          </div>
                          <span class="text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-base-content/[0.06] text-base-content/30 shrink-0">Inactiva</span>
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Modals */}
      <Show when={showMemberModal()}>
        <MemberModal
          member={editingMember()}
          onClose={() => setShowMemberModal(false)}
          onSaved={handleMemberSaved}
        />
      </Show>

      <Show when={showProjectModal()}>
        <ProjectModal
          project={editingProject()}
          onClose={() => setShowProjectModal(false)}
          onSaved={handleProjectSaved}
        />
      </Show>

      <Show when={showAssignmentModal()}>
        <CreateAssignmentModal
          assignment={editingAssignment()}
          onClose={() => setShowAssignmentModal(false)}
          onSaved={refetchAssignments}
        />
      </Show>

      <Show when={showRecurringModal()}>
        <RecurringStoryModal
          story={editingRecurring()}
          onClose={() => setShowRecurringModal(false)}
          onSaved={refetchRecurring}
        />
      </Show>
    </>
  );
};

export default AdminPage;
