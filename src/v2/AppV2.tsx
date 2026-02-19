import { createSignal, For, Show, type Component } from 'solid-js';
import { LayoutDashboard, ClipboardList, Users, FolderKanban, Sun, Moon, LogOut, Plus } from 'lucide-solid';
import type { ReportCategory } from './types';
import { AuthProvider, useAuth } from './lib/auth';
import { DataProvider, useData } from './lib/data';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ReportPage from './pages/ReportPage';
import TeamPage from './pages/TeamPage';
import ProjectsPage from './pages/ProjectsPage';
import AssignmentsPage from './pages/AssignmentsPage';
import CreateStoryModal from './components/CreateStoryModal';

type Tab = 'dashboard' | 'report' | 'team' | 'projects' | 'assignments';

const AppShell: Component = () => {
  const auth = useAuth();
  const [activeTab, setActiveTab] = createSignal<Tab>('dashboard');
  const [isDark, setIsDark] = createSignal(true);
  const [showCreateModal, setShowCreateModal] = createSignal(false);
  const [createCategory, setCreateCategory] = createSignal<ReportCategory | undefined>();
  const [createProjectId, setCreateProjectId] = createSignal<string | undefined>();
  const [refreshKey, setRefreshKey] = createSignal(0);

  const openCreateModal = (category?: ReportCategory, projectId?: string) => {
    setCreateCategory(category);
    setCreateProjectId(projectId);
    setShowCreateModal(true);
  };

  const handleStoryCreated = () => {
    setRefreshKey(k => k + 1);
  };

  document.documentElement.setAttribute('data-theme', 'ios-dark');

  const toggleTheme = () => {
    const next = !isDark();
    setIsDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'ios-dark' : 'ios');
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
    { id: 'report', label: 'Reporte', icon: ClipboardList },
    { id: 'team', label: 'Equipo', icon: Users },
    { id: 'projects', label: 'Proyectos', icon: FolderKanban },
  ];

  const user = () => auth.user();

  return (
    <div class="min-h-screen bg-base-100 text-base-content font-system">

      {/* Top Bar */}
      <header class="sticky top-0 z-50 bg-base-100/80 backdrop-blur-xl border-b border-base-300">
        <div class="max-w-6xl mx-auto px-4 lg:px-6">
          <div class="h-12 flex items-center justify-between">
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 rounded-lg bg-ios-blue-500 flex items-center justify-center text-white font-bold text-xs">
                  D
                </div>
                <div>
                  <span class="font-semibold text-sm leading-none block">Daily Check</span>
                  <span class="text-[10px] text-base-content/35 leading-none">
                    {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              </div>

              <nav class="hidden md:flex items-center gap-1">
                <For each={tabs}>
                  {(tab) => (
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        activeTab() === tab.id
                          ? 'bg-base-content/10 text-base-content'
                          : 'text-base-content/40 hover:text-base-content/70 hover:bg-base-content/5'
                      }`}
                    >
                      <tab.icon size={14} />
                      {tab.label}
                    </button>
                  )}
                </For>
              </nav>
            </div>

            <div class="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                class="p-1.5 rounded-lg text-base-content/40 hover:text-base-content/70 hover:bg-base-content/5 transition-all"
              >
                <Show when={isDark()} fallback={<Sun size={16} />}>
                  <Moon size={16} />
                </Show>
              </button>
              <button
                onClick={() => auth.logout()}
                class="p-1.5 rounded-lg text-base-content/40 hover:text-red-500 hover:bg-red-500/10 transition-all"
                title="Cerrar sesión"
              >
                <LogOut size={16} />
              </button>
              <Show when={user()}>
                <div class="flex items-center gap-2 pl-2 border-l border-base-300">
                  <img
                    src={user()!.avatar_url!}
                    alt={user()!.name}
                    class="w-6 h-6 rounded-full"
                  />
                  <span class="text-xs font-medium hidden sm:inline text-base-content/70">{user()!.name}</span>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </header>

      {/* Content — all pages mounted, toggle visibility to avoid refetch flicker */}
      <main class="max-w-6xl mx-auto px-4 lg:px-6 py-5 pb-24 md:pb-5">
        <div style={{ display: activeTab() === 'dashboard' ? undefined : 'none' }}>
          <DashboardPage refreshKey={refreshKey()} />
        </div>
        <div style={{ display: activeTab() === 'report' ? undefined : 'none' }}>
          <ReportPage onCreateStory={(cat) => openCreateModal(cat)} refreshKey={refreshKey()} />
        </div>
        <div style={{ display: activeTab() === 'team' ? undefined : 'none' }}>
          <TeamPage />
        </div>
        <div style={{ display: activeTab() === 'projects' ? undefined : 'none' }}>
          <ProjectsPage onCreateStory={(projId) => openCreateModal(undefined, projId)} refreshKey={refreshKey()} />
        </div>
      </main>

      {/* FAB - Create Story */}
      <button
        onClick={() => openCreateModal()}
        class="fixed bottom-24 md:bottom-6 right-4 z-40 w-12 h-12 rounded-full bg-ios-blue-500 text-white shadow-lg shadow-ios-blue-500/30 flex items-center justify-center active:scale-95 transition-transform hover:bg-ios-blue-600"
      >
        <Plus size={22} />
      </button>

      {/* Mobile Bottom Nav — Floating island */}
      <nav class="md:hidden fixed bottom-3 left-4 right-4 z-50">
        <div class="bg-base-200/80 backdrop-blur-2xl rounded-2xl border border-base-content/[0.06] shadow-lg shadow-black/20">
          <div class="flex items-center justify-around h-14">
            <For each={tabs}>
              {(tab) => (
                <button
                  onClick={() => setActiveTab(tab.id)}
                  class={`flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-xl transition-all ${
                    activeTab() === tab.id
                      ? 'text-ios-blue-500'
                      : 'text-base-content/30 active:text-base-content/50'
                  }`}
                >
                  <tab.icon size={19} strokeWidth={activeTab() === tab.id ? 2.2 : 1.8} />
                  <span class={`text-[9px] font-medium ${activeTab() === tab.id ? 'text-ios-blue-500' : ''}`}>{tab.label}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </nav>

      {/* Create Story Modal */}
      <Show when={showCreateModal()}>
        <CreateStoryModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleStoryCreated}
          defaultCategory={createCategory()}
          defaultProjectId={createProjectId()}
        />
      </Show>
    </div>
  );
};

const AppV2: Component = () => {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
};

const AuthGate: Component = () => {
  const auth = useAuth();

  return (
    <Show
      when={!auth.loading()}
      fallback={
        <div class="min-h-screen flex items-center justify-center bg-base-100">
          <div class="flex flex-col items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-ios-blue-500 flex items-center justify-center text-white font-bold text-lg">
              D
            </div>
            <span class="text-sm text-base-content/40">Cargando...</span>
          </div>
        </div>
      }
    >
      <Show when={auth.isAuthenticated()} fallback={<LoginPage />}>
        <DataProvider>
          <AppShell />
        </DataProvider>
      </Show>
    </Show>
  );
};

export default AppV2;
