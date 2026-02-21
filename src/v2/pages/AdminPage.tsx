import { createSignal, For, Show, type Component } from 'solid-js';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import { api } from '../lib/api';
import {
  Users, FolderKanban, Plus, Pencil, Shield,
  ChevronDown, ChevronRight, UserIcon, Archive, Send,
} from 'lucide-solid';
import MemberModal from '../components/MemberModal';
import ProjectModal from '../components/ProjectModal';
import CreateAssignmentModal from '../components/CreateAssignmentModal';
import type { User, Project } from '../types';

type AdminTab = 'team' | 'projects';

const AdminPage: Component = () => {
  const auth = useAuth();
  const data = useData();
  const [activeTab, setActiveTab] = createSignal<AdminTab>('team');
  const [showMemberModal, setShowMemberModal] = createSignal(false);
  const [editingMember, setEditingMember] = createSignal<User | undefined>();
  const [showProjectModal, setShowProjectModal] = createSignal(false);
  const [editingProject, setEditingProject] = createSignal<Project | undefined>();
  const [showAssignmentModal, setShowAssignmentModal] = createSignal(false);
  const [showInactive, setShowInactive] = createSignal(false);
  const [showArchived, setShowArchived] = createSignal(false);

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

  return (
    <>
      <div class="space-y-4">
        {/* Header */}
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-bold">Administración</h1>
          <button
            onClick={() => setShowAssignmentModal(true)}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-all"
          >
            <Send size={13} />
            Nueva encomienda
          </button>
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
        </div>

        {/* ─── Team Section ─── */}
        <Show when={activeTab() === 'team'}>
          <div class="space-y-3 stagger-in">
            {/* Add Button */}
            <button
              onClick={openCreateMember}
              class="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-base-content/[0.08] text-ios-blue-500 text-xs font-medium hover:bg-ios-blue-500/5 hover:border-ios-blue-500/20 transition-all"
            >
              <Plus size={14} />
              Agregar miembro
            </button>

            {/* Active Members */}
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
                      <div class="flex items-center gap-2 shrink-0">
                        <span class={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${
                          member.role === 'admin'
                            ? 'bg-amber-500/15 text-amber-500'
                            : 'bg-base-content/[0.06] text-base-content/30'
                        }`}>
                          {member.role === 'admin' ? 'Admin' : 'Colab'}
                        </span>
                        <Pencil size={13} class="text-base-content/15 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>

            {/* Inactive Members */}
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
            {/* Add Button */}
            <button
              onClick={openCreateProject}
              class="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-base-content/[0.08] text-ios-blue-500 text-xs font-medium hover:bg-ios-blue-500/5 hover:border-ios-blue-500/20 transition-all"
            >
              <Plus size={14} />
              Nuevo proyecto
            </button>

            {/* Active Projects */}
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

            {/* Archived Projects */}
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
          onClose={() => setShowAssignmentModal(false)}
          onCreated={() => {}}
        />
      </Show>
    </>
  );
};

export default AdminPage;
