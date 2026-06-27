import { createSignal, createResource, onCleanup, onMount, For, Show, type Component } from 'solid-js';
import { useOnceReady } from '../lib/onceReady';
import { useRealtimeRefetch } from '../lib/realtime';
import { activeTab as globalActiveTab } from '../lib/activeTab';
import { useRefetchOnActive } from '../lib/refetchOnActive';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { api, type SecretMeta } from '../lib/api';
import {
  Users, FolderKanban, Plus, Pencil, Shield,
  ChevronDown, ChevronRight, UserIcon, Archive, Send,
  Flag, CalendarDays, Copy, Check, RefreshCw,
  Lock, Eye, Trash2, AlertCircle, Receipt, Link2,
} from 'lucide-solid';
import BillingTab from '../features/billing/BillingTab';
import MemberModal from '../components/MemberModal';
import ProjectModal from '../components/ProjectModal';
import CreateAssignmentModal from '../components/CreateAssignmentModal';
import RecurringStoryModal from '../components/RecurringStoryModal';
import SecretEditor from '../components/secrets/SecretEditor';
import SecretRevealSheet from '../components/secrets/SecretRevealSheet';
import SecretShareModal from '../components/secrets/SecretShareModal';
import { billingApi } from '../features/billing/lib/api';
import TopNavigation from '../components/TopNavigation';
import { frequencyLabel, isRecurring } from '../lib/recurrence';
import type { User, Project, Assignment, Story } from '../types';

type AdminTab = 'team' | 'projects' | 'assignments' | 'recurring' | 'secrets' | 'billing';

const SECRET_EVENT_LABELS: Record<string, string> = {
  'secret.created': 'Creado',
  'secret.updated': 'Actualizado',
  'secret.revealed': 'Revelado',
  'secret.deleted': 'Eliminado',
  'secret.associated_project_changed': 'Proyecto cambiado',
  'secret.tags_changed': 'Etiquetas cambiadas',
};
const secretEventLabel = (t: string): string => SECRET_EVENT_LABELS[t] ?? t;

const formatRelative = (dateStr: string | null): string => {
  if (!dateStr) return 'nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `hace ${weeks} sem`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? '' : 'es'}`;
  return `hace ${Math.floor(days / 365)} año${Math.floor(days / 365) === 1 ? '' : 's'}`;
};

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
      const all = await api.stories.list({ include_inactive: 'true' });
      return (all as Story[]).filter(s => isRecurring(s));
    },
  );

  const activeRecurring = () => (recurringList() ?? []).filter(s => s.is_active);
  const inactiveRecurring = () => (recurringList() ?? []).filter(s => !s.is_active);

  // Secrets (internal vault) — admin-only, lives as a tab in this page.
  const [secretsList, { refetch: refetchSecrets, mutate: mutateSecrets }] = createResource(
    () => true,
    () => api.secrets.list(),
  );
  const secretsReady = useOnceReady(secretsList);

  // Billing — client count for the tab badge. The tab itself fetches its own data.
  const [billingClients] = createResource(() => billingApi.clients.list());
  const activeSecrets = () => (secretsList() ?? []).filter((s) => !s.revoked_at);
  const [showSecretEditor, setShowSecretEditor] = createSignal(false);
  const [editingSecret, setEditingSecret] = createSignal<SecretMeta | null>(null);
  const [revealSecret, setRevealSecret] = createSignal<SecretMeta | null>(null);
  const [shareSecret, setShareSecret] = createSignal<SecretMeta | null>(null);
  const [confirmDeleteSecret, setConfirmDeleteSecret] = createSignal<SecretMeta | null>(null);
  const [deletingSecret, setDeletingSecret] = createSignal(false);

  const openCreateSecret = () => { setEditingSecret(null); setShowSecretEditor(true); };
  const openEditSecret = (s: SecretMeta) => { setEditingSecret(s); setShowSecretEditor(true); };
  const closeSecretEditor = () => { setShowSecretEditor(false); setEditingSecret(null); };
  const handleSecretSaved = () => { closeSecretEditor(); void refetchSecrets(); };
  const secretProjectName = (id: string | null) => (id ? data.getProjectById(id)?.name ?? 'Proyecto' : null);

  const handleDeleteSecret = async () => {
    const s = confirmDeleteSecret();
    if (!s || deletingSecret()) return;
    setDeletingSecret(true);
    try {
      await api.secrets.remove(s.id);
      mutateSecrets((prev) => (prev ?? []).filter((x) => x.id !== s.id));
      setConfirmDeleteSecret(null);
    } catch { /* keep the dialog open on failure */ }
    finally { setDeletingSecret(false); }
  };

  // Latches: only show "vacío" copy after each list has loaded once. Without
  // this the empty-state messages flicker during realtime refetches.
  const assignmentsReady = useOnceReady(assignmentsList);
  const recurringReady = useOnceReady(recurringList);

  onMount(() => {
    const unsub = useRealtimeRefetch(
      ['assignment.', 'story.'],
      () => {
        void refetchAssignments();
        void refetchRecurring();
      },
      { isActive: () => globalActiveTab() === 'admin' },
    );
    onCleanup(unsub);
  });

  // Keep-alive freshness: AdminPage stays mounted, and its lists use static
  // resource sources, so without this they only ever load once. Refetch them
  // when the user navigates back to Admin (the reported "creo un secreto en
  // otra pestaña/sesión y no aparece" case) or returns to the window.
  useRefetchOnActive('admin', [
    () => refetchSecrets(),
    () => refetchAssignments(),
    () => refetchRecurring(),
    () => data.refetchUsers(),
    () => data.refetchProjects(),
  ]);

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

  const adminTabs = () => [
    { key: 'team' as const, label: 'Equipo', icon: Users, count: data.users().length },
    { key: 'projects' as const, label: 'Proyectos', icon: FolderKanban, count: data.projects().length },
    { key: 'assignments' as const, label: 'Encomiendas', icon: Send, count: openAssignments().length },
    { key: 'recurring' as const, label: 'Recurrentes', icon: RefreshCw, count: activeRecurring().length },
    { key: 'secrets' as const, label: 'Secretos', icon: Lock, count: activeSecrets().length },
    { key: 'billing' as const, label: 'Facturación', icon: Receipt, count: (billingClients() ?? []).length },
  ];

  const sectionMeta = () => {
    switch (activeTab()) {
      case 'projects':
        return {
          title: 'Proyectos',
          description: `${activeProjects().length} activos · ${archivedProjects().length} archivados`,
          actionLabel: 'Nuevo proyecto',
          action: openCreateProject,
        };
      case 'assignments':
        return {
          title: 'Encomiendas',
          description: `${openAssignments().length} abiertas · ${closedAssignments().length} cerradas`,
          actionLabel: 'Nueva encomienda',
          action: openCreateAssignment,
        };
      case 'recurring':
        return {
          title: 'Recurrentes',
          description: `${activeRecurring().length} activas · ${inactiveRecurring().length} inactivas`,
          actionLabel: 'Nueva recurrente',
          action: openCreateRecurring,
        };
      case 'secrets':
        return {
          title: 'Secretos',
          description: `${activeSecrets().length} ${activeSecrets().length === 1 ? 'secreto' : 'secretos'}`,
          actionLabel: 'Nuevo secreto',
          action: openCreateSecret,
        };
      case 'billing': {
        const n = (billingClients() ?? []).length;
        return {
          title: 'Facturación',
          description: `${n} ${n === 1 ? 'cliente' : 'clientes'}`,
          // Billing manages its own create/back navigation in the tab.
          actionLabel: null,
          action: () => {},
        };
      }
      default:
        return {
          title: 'Equipo',
          description: `${activeMembers().length} activos · ${inactiveMembers().length} inactivos`,
          actionLabel: 'Agregar miembro',
          action: openCreateMember,
        };
    }
  };

  const rowClass = 'group flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-base-content/[0.025] cursor-pointer';
  const mutedRowClass = 'group flex min-h-[58px] items-center gap-3 px-4 py-3 transition-colors hover:bg-base-content/[0.025] cursor-pointer opacity-55';

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
      <div class="space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TopNavigation
          breadcrumbs={[{ label: 'Administración', icon: <Shield size={14} /> }]}
        />

        {/* Tab Selector */}
        <div class="flex flex-wrap items-center gap-2 px-0.5">
          <For each={adminTabs()}>
            {(item) => {
              const Icon = item.icon;
              const active = () => activeTab() === item.key;
              return (
                <button
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  aria-pressed={active()}
                  class={`group flex h-10 items-center gap-2 rounded-[14px] border px-3 text-xs font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/30 ${
                    active()
                      ? 'bg-base-100 text-base-content border-ios-blue-500/70 ring-1 ring-ios-blue-500/70 shadow-[0_0_0_4px_rgba(0,122,255,0.08)]'
                      : 'bg-base-100/55 text-base-content/58 border-base-content/[0.075] hover:bg-base-content/[0.025] hover:text-base-content/82 hover:border-base-content/[0.13]'
                  }`}
                >
                  <Icon size={14} strokeWidth={2.35} />
                  <span>{item.label}</span>
                  <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-base-content/[0.055] px-1.5 text-[10px] font-bold text-base-content/48 tabular-nums">
                    {item.count}
                  </span>
                </button>
              );
            }}
          </For>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-base-content/[0.06] bg-base-100/60 px-4 py-3">
          <div class="min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-[0.1em] text-base-content/32">Gestión</p>
            <div class="mt-0.5 flex items-baseline gap-2">
              <h1 class="text-[16px] font-bold leading-tight text-base-content">{sectionMeta().title}</h1>
              <span class="text-[12px] font-medium text-base-content/38">{sectionMeta().description}</span>
            </div>
          </div>
          <Show when={sectionMeta().actionLabel}>
            <button
              type="button"
              onClick={() => sectionMeta().action()}
              class="inline-flex h-10 items-center justify-center gap-2 rounded-[14px] bg-base-content px-3.5 text-xs font-semibold text-base-100 transition-colors hover:bg-base-content/82 focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/30"
            >
              <Plus size={15} strokeWidth={2.4} />
              {sectionMeta().actionLabel}
            </button>
          </Show>
        </div>

        {/* ─── Team Section ─── */}
        <Show when={activeTab() === 'team'}>
          <div class="space-y-3 stagger-in">
            <div class="overflow-hidden rounded-[18px] border border-base-content/[0.06] bg-base-100/55 divide-y divide-base-content/[0.055]">
              <For each={activeMembers()}>
                {(member) => {
                  const isMe = () => member.id === auth.user()?.id;
                  return (
                    <div
                      class={rowClass}
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
              <div class="space-y-2">
                <button
                  onClick={() => setShowInactive(!showInactive())}
                  class="flex h-8 items-center gap-1.5 rounded-[10px] px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-base-content/32 transition-colors hover:bg-base-content/[0.035] hover:text-base-content/48"
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
                        class={mutedRowClass}
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
            <div class="overflow-hidden rounded-[18px] border border-base-content/[0.06] bg-base-100/55 divide-y divide-base-content/[0.055]">
              <For each={activeProjects()}>
                {(project) => {
                  const creator = () => data.getUserById(project.created_by);
                  return (
                    <div
                      class={rowClass}
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
              <div class="space-y-2">
                <button
                  onClick={() => setShowArchived(!showArchived())}
                  class="flex h-8 items-center gap-1.5 rounded-[10px] px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-base-content/32 transition-colors hover:bg-base-content/[0.035] hover:text-base-content/48"
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
                        class={mutedRowClass}
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
            {/* Open assignments */}
            <div class="overflow-hidden rounded-[18px] border border-base-content/[0.06] bg-base-100/55 divide-y divide-base-content/[0.055]">
              <Show when={openAssignments().length === 0 && assignmentsReady()}>
                <div class="px-4 py-8 text-center text-xs font-medium text-base-content/25">
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
                      class={rowClass}
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
              <div class="space-y-2">
                <button
                  onClick={() => setShowClosed(!showClosed())}
                  class="flex h-8 items-center gap-1.5 rounded-[10px] px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-base-content/32 transition-colors hover:bg-base-content/[0.035] hover:text-base-content/48"
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
                          class={mutedRowClass}
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
            {/* Active recurring */}
            <div class="overflow-hidden rounded-[18px] border border-base-content/[0.06] bg-base-100/55 divide-y divide-base-content/[0.055]">
              <Show when={activeRecurring().length === 0 && recurringReady()}>
                <div class="px-4 py-8 text-center text-xs font-medium text-base-content/25">
                  Sin tareas recurrentes
                </div>
              </Show>
              <For each={activeRecurring()}>
                {(story) => {
                  const assignee = () => getAssignee(story.assignee_id ?? '');
                  const project = () => getProject(story.project_id);
                  return (
                    <div
                      class={rowClass}
                      onClick={() => openEditRecurring(story)}
                    >
                      <Show
                        when={assignee()?.avatar_url}
                        fallback={
                          <div class="w-8 h-8 rounded-full bg-base-content/[0.06] flex items-center justify-center text-[11px] font-bold text-base-content/40 shrink-0">
                            {assignee()?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? '?'}
                          </div>
                        }
                      >
                        <img src={assignee()!.avatar_url!} alt="" class="w-8 h-8 rounded-full object-cover shrink-0" />
                      </Show>
                      <div class="flex-1 min-w-0">
                        <p class="text-[13px] font-medium text-base-content/90 truncate">{story.title}</p>
                        <div class="flex items-center gap-3 mt-0.5 text-[11px] text-base-content/40">
                          <span class="truncate">{assignee()?.name?.split(' ')[0] ?? '...'}</span>
                          <span class="inline-flex items-center gap-1 shrink-0">
                            <RefreshCw size={10} strokeWidth={2.5} class="opacity-70" />
                            {frequencyLabel(story)}
                          </span>
                          <Show when={project()}>
                            <span class="inline-flex items-center gap-1.5 shrink-0">
                              <span
                                class="w-1.5 h-1.5 rounded-full"
                                style={{ background: project()!.color }}
                                aria-hidden="true"
                              />
                              <span class="font-semibold text-base-content/50">{project()!.prefix}</span>
                            </span>
                          </Show>
                        </div>
                      </div>
                      <Pencil size={13} class="text-base-content/20 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  );
                }}
              </For>
            </div>

            {/* Inactive recurring */}
            <Show when={inactiveRecurring().length > 0}>
              <div class="space-y-2">
                <button
                  onClick={() => setShowInactiveRecurring(!showInactiveRecurring())}
                  class="flex h-8 items-center gap-1.5 rounded-[10px] px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-base-content/32 transition-colors hover:bg-base-content/[0.035] hover:text-base-content/48"
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
                          class={mutedRowClass}
                          onClick={() => openEditRecurring(story)}
                        >
                          <Show
                            when={assignee()?.avatar_url}
                            fallback={
                              <div class="w-8 h-8 rounded-full bg-base-content/5 flex items-center justify-center text-[11px] font-bold text-base-content/20 shrink-0">
                                {assignee()?.name?.[0] ?? '?'}
                              </div>
                            }
                          >
                            <img src={assignee()!.avatar_url!} alt="" class="w-8 h-8 rounded-full object-cover shrink-0 grayscale" />
                          </Show>
                          <div class="flex-1 min-w-0">
                            <p class="text-[13px] font-medium truncate">{story.title}</p>
                            <span class="text-[11px] text-base-content/30">{assignee()?.name?.split(' ')[0] ?? '...'}</span>
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

        {/* ─── Secrets Section ─── */}
        <Show when={activeTab() === 'secrets'}>
          <div class="space-y-3 stagger-in">
            <div class="overflow-hidden rounded-[18px] border border-base-content/[0.06] bg-base-100/55 divide-y divide-base-content/[0.055]">
              <Show when={activeSecrets().length === 0 && secretsReady()}>
                <div class="px-4 py-10 text-center">
                  <div class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-ios-blue-500/10 text-ios-blue-500">
                    <Lock size={18} />
                  </div>
                  <p class="text-sm font-semibold">Aún no hay secretos</p>
                  <p class="mx-auto mt-1 max-w-xs text-xs text-base-content/40">
                    Guarda claves y credenciales del equipo y revélalas solo cuando las necesites.
                  </p>
                </div>
              </Show>
              <For each={activeSecrets()}>
                {(secret) => {
                  const proj = () => secretProjectName(secret.project_id);
                  return (
                    <div class={rowClass} onClick={() => openEditSecret(secret)}>
                      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ios-blue-500/10 text-ios-blue-500">
                        <Lock size={15} />
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <p class="truncate text-sm font-medium">{secret.name}</p>
                          <For each={secret.environments}>
                            {(env) => (
                              <span class="shrink-0 rounded-md bg-ios-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-ios-blue-500">
                                {env}
                              </span>
                            )}
                          </For>
                        </div>
                        <div class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-base-content/40">
                          <code class="max-w-[45%] truncate font-mono text-[10.5px] text-base-content/55">{secret.key}</code>
                          <Show when={proj()} fallback={<span class="shrink-0">· Global/Equipo</span>}>
                            <span class="shrink-0 truncate">· {proj()}</span>
                          </Show>
                          <Show when={secret.last_event}>
                            {(ev) => (
                              <span class="shrink-0 truncate">· {secretEventLabel(ev().event_type)} {formatRelative(ev().created_at)}</span>
                            )}
                          </Show>
                        </div>
                        <Show when={secret.tags.length > 0}>
                          <div class="mt-1.5 flex flex-wrap gap-1">
                            <For each={secret.tags.slice(0, 4)}>
                              {(t) => (
                                <span class="rounded-md bg-base-content/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-base-content/50">{t}</span>
                              )}
                            </For>
                            <Show when={secret.tags.length > 4}>
                              <span class="rounded-md bg-base-content/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-base-content/40">+{secret.tags.length - 4}</span>
                            </Show>
                          </div>
                        </Show>
                      </div>
                      <div class="flex shrink-0 items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setRevealSecret(secret); }}
                          title="Revelar valor"
                          aria-label={`Revelar ${secret.name}`}
                          class="rounded-lg p-2 text-base-content/35 transition-colors hover:bg-ios-blue-500/10 hover:text-ios-blue-500"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShareSecret(secret); }}
                          title="Compartir por URL"
                          aria-label={`Compartir ${secret.name}`}
                          class="rounded-lg p-2 text-base-content/35 transition-colors hover:bg-ios-blue-500/10 hover:text-ios-blue-500"
                        >
                          <Link2 size={15} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteSecret(secret); }}
                          title="Eliminar secreto"
                          aria-label={`Eliminar ${secret.name}`}
                          class="rounded-lg p-2 text-base-content/35 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                        >
                          <Trash2 size={15} />
                        </button>
                        <Pencil size={14} class="text-base-content/15 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
            <p class="px-1 text-[11px] leading-relaxed text-base-content/35">
              Vault interno cifrado (AES-256-GCM). Las listas nunca exponen el valor; cada revelación queda auditada.
            </p>
          </div>
        </Show>

        {/* ─── Billing Section ─── */}
        <Show when={activeTab() === 'billing'}>
          <BillingTab />
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

      {/* Secret editor — full screen */}
      <Show when={showSecretEditor()}>
        <SecretEditor
          secret={editingSecret() ?? undefined}
          onClose={closeSecretEditor}
          onSaved={handleSecretSaved}
        />
      </Show>

      {/* Secret reveal — compact sheet, plaintext wiped on close */}
      <Show when={revealSecret()}>
        {(s) => (
          <SecretRevealSheet
            secret={s()}
            onClose={() => setRevealSecret(null)}
            onRevealed={refetchSecrets}
          />
        )}
      </Show>

      {/* Secret share — bind to a PAT, URL shown once */}
      <Show when={shareSecret()}>
        {(s) => (
          <SecretShareModal
            secret={s()}
            onClose={() => setShareSecret(null)}
          />
        )}
      </Show>

      {/* Secret delete confirm */}
      <Show when={confirmDeleteSecret()}>
        {(s) => (
          <div
            class="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 backdrop-blur-md sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget && !deletingSecret()) setConfirmDeleteSecret(null); }}
          >
            <div class="w-full overflow-hidden rounded-t-[24px] bg-base-100 shadow-2xl sm:max-w-md sm:rounded-[24px]">
              <div class="flex items-start gap-3 border-b border-base-content/[0.06] px-5 py-4">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                  <AlertCircle size={18} />
                </div>
                <div class="min-w-0">
                  <h2 class="text-[15px] font-semibold">Eliminar secreto</h2>
                  <p class="mt-0.5 truncate text-xs text-base-content/40">{s().name}</p>
                </div>
              </div>
              <div class="px-5 py-4">
                <p class="text-sm leading-relaxed text-base-content/70">
                  Se marcará como eliminado y dejará de estar disponible para agentes e integraciones. La auditoría se conserva.
                </p>
              </div>
              <div class="flex justify-end gap-2 border-t border-base-content/[0.06] px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteSecret(null)}
                  class="rounded-xl px-4 py-2 text-sm font-medium text-base-content/60 transition-colors hover:bg-base-content/5"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSecret}
                  disabled={deletingSecret()}
                  class="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40"
                >
                  {deletingSecret() ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </>
  );
};

export default AdminPage;
