import { createSignal, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import { LayoutDashboard, ClipboardList, Users, FolderKanban, Sun, Moon, LogOut, Plus, Search } from 'lucide-solid';
import type { ReportCategory, Story } from './types';
import { AuthProvider, useAuth } from './lib/auth';
import { DataProvider, useData } from './lib/data';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ReportPage from './pages/ReportPage';
import TeamPage from './pages/TeamPage';
import ProjectsPage from './pages/ProjectsPage';
import AssignmentsPage from './pages/AssignmentsPage';
import CreateStoryModal from './components/CreateStoryModal';
import SearchModal from './components/SearchModal';
import StoryDetail from './components/StoryDetail';

type Tab = 'dashboard' | 'report' | 'team' | 'projects' | 'assignments';

const AppShell: Component = () => {
  const auth = useAuth();
  const [activeTab, setActiveTab] = createSignal<Tab>('dashboard');
  const savedTheme = localStorage.getItem('dc-theme') || 'ios-dark';
  const [isDark, setIsDark] = createSignal(savedTheme === 'ios-dark');
  const [showCreateModal, setShowCreateModal] = createSignal(false);
  const [createCategory, setCreateCategory] = createSignal<ReportCategory | undefined>();
  const [createProjectId, setCreateProjectId] = createSignal<string | undefined>();
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [showSearch, setShowSearch] = createSignal(false);
  const [searchSelectedStory, setSearchSelectedStory] = createSignal<Story | null>(null);

  const openCreateModal = (category?: ReportCategory, projectId?: string) => {
    setCreateCategory(category);
    setCreateProjectId(projectId);
    setShowCreateModal(true);
  };

  const handleStoryCreated = () => {
    setRefreshKey(k => k + 1);
  };

  const toggleTheme = () => {
    const next = !isDark();
    setIsDark(next);
    const theme = next ? 'ios-dark' : 'ios';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dc-theme', theme);
  };

  const tabs: { id: Tab; label: string; icon: any; key: string }[] = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, key: 'I' },
    { id: 'report', label: 'Reporte', icon: ClipboardList, key: 'R' },
    { id: 'team', label: 'Equipo', icon: Users, key: 'E' },
    { id: 'projects', label: 'Proyectos', icon: FolderKanban, key: 'P' },
  ];

  const user = () => auth.user();

  // Global keyboard shortcuts
  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Cmd+K or Cmd+F — open search
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault();
        setShowSearch(true);
        return;
      }

      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'n': e.preventDefault(); openCreateModal(); break;
        case 'i': e.preventDefault(); setActiveTab('dashboard'); break;
        case 'r': e.preventDefault(); setActiveTab('report'); break;
        case 'e': e.preventDefault(); setActiveTab('team'); break;
        case 'p': e.preventDefault(); setActiveTab('projects'); break;
      }
    };
    document.addEventListener('keydown', handleKey);
    onCleanup(() => document.removeEventListener('keydown', handleKey));
  });

  return (
    <div class="min-h-screen bg-base-100 text-base-content font-system">

      {/* Floating Top Bar */}
      <header class="sticky top-0 z-50 px-3 pt-3 hidden md:block">
        <div class="max-w-5xl mx-auto bg-base-200/60 backdrop-blur-2xl rounded-2xl border border-base-content/[0.06] shadow-lg shadow-black/10">
          <div class="h-12 px-4 flex items-center justify-between">
            <div class="flex items-center gap-5">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 rounded-lg bg-ios-blue-500 flex items-center justify-center text-white font-bold text-xs">
                  D
                </div>
                <span class="font-semibold text-sm">Daily Check</span>
              </div>

              <div class="w-px h-5 bg-base-content/10" />

              <nav class="flex items-center gap-0.5">
                <For each={tabs}>
                  {(tab) => (
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      class={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                        activeTab() === tab.id
                          ? 'bg-base-content/10 text-base-content'
                          : 'text-base-content/35 hover:text-base-content/60 hover:bg-base-content/5'
                      }`}
                    >
                      <tab.icon size={14} strokeWidth={activeTab() === tab.id ? 2.2 : 1.8} />
                      {tab.label}
                      <kbd class="hidden lg:inline text-[9px] text-base-content/15 border border-base-content/[0.06] rounded px-1 py-px ml-0.5">{tab.key}</kbd>
                    </button>
                  )}
                </For>
              </nav>
            </div>

            <div class="flex items-center gap-1">
              <button
                onClick={() => setShowSearch(true)}
                class="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-base-content/25 hover:text-base-content/50 hover:bg-base-content/5 transition-all"
                title="Buscar (⌘K)"
              >
                <Search size={14} />
                <span class="text-[10px] text-base-content/20 hidden lg:inline">Buscar</span>
                <kbd class="hidden lg:flex text-[9px] text-base-content/15 border border-base-content/[0.08] rounded px-1 py-px">⌘K</kbd>
              </button>
              <button
                onClick={toggleTheme}
                class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 hover:bg-base-content/5 transition-all"
              >
                <Show when={isDark()} fallback={<Sun size={15} />}>
                  <Moon size={15} />
                </Show>
              </button>
              <button
                onClick={() => auth.logout()}
                class="p-2 rounded-xl text-base-content/35 hover:text-red-500 hover:bg-red-500/10 transition-all"
                title="Cerrar sesión"
              >
                <LogOut size={15} />
              </button>
              <Show when={user()}>
                <div class="ml-1 pl-2 border-l border-base-content/[0.06]">
                  <img
                    src={user()!.avatar_url!}
                    alt={user()!.name}
                    class="w-7 h-7 rounded-full ring-2 ring-base-content/[0.06]"
                  />
                </div>
              </Show>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Top Bar — minimal */}
      <header class="md:hidden sticky top-0 z-50 px-3 pt-2">
        <div class="bg-base-200/60 backdrop-blur-2xl rounded-2xl border border-base-content/[0.06] shadow-lg shadow-black/10">
          <div class="h-11 px-4 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-6 h-6 rounded-md bg-ios-blue-500 flex items-center justify-center text-white font-bold text-[10px]">
                D
              </div>
              <span class="font-semibold text-sm">Daily Check</span>
            </div>
            <div class="flex items-center gap-0.5">
              <button
                onClick={() => setShowSearch(true)}
                class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 transition-all"
                title="Buscar"
              >
                <Search size={16} />
              </button>
              <button
                onClick={toggleTheme}
                class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 transition-all"
              >
                <Show when={isDark()} fallback={<Sun size={15} />}>
                  <Moon size={15} />
                </Show>
              </button>
              <Show when={user()}>
                <img
                  src={user()!.avatar_url!}
                  alt={user()!.name}
                  class="w-6 h-6 rounded-full ring-2 ring-base-content/[0.06] ml-0.5"
                />
              </Show>
            </div>
          </div>
        </div>
      </header>

      {/* Content — all pages mounted, toggle visibility to avoid refetch flicker */}
      <main class="max-w-5xl mx-auto px-4 lg:px-6 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-5">
        <div class={activeTab() === 'dashboard' ? 'stagger-in' : ''} style={{ display: activeTab() === 'dashboard' ? undefined : 'none' }}>
          <DashboardPage refreshKey={refreshKey()} onStoryDeleted={handleStoryCreated} />
        </div>
        <div class={activeTab() === 'report' ? 'stagger-in' : ''} style={{ display: activeTab() === 'report' ? undefined : 'none' }}>
          <ReportPage onCreateStory={(cat) => openCreateModal(cat)} refreshKey={refreshKey()} onStoryDeleted={handleStoryCreated} />
        </div>
        <div class={activeTab() === 'team' ? 'stagger-in' : ''} style={{ display: activeTab() === 'team' ? undefined : 'none' }}>
          <TeamPage />
        </div>
        <div class={activeTab() === 'projects' ? 'stagger-in' : ''} style={{ display: activeTab() === 'projects' ? undefined : 'none' }}>
          <ProjectsPage onCreateStory={(projId) => openCreateModal(undefined, projId)} refreshKey={refreshKey()} onStoryDeleted={handleStoryCreated} />
        </div>
      </main>

      {/* FAB - Create Story */}
      <div class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 right-4 z-40 group">
        <button
          onClick={() => openCreateModal()}
          class="w-12 h-12 rounded-full bg-ios-blue-500 text-white shadow-lg shadow-ios-blue-500/30 flex items-center justify-center active:scale-95 transition-all hover:bg-ios-blue-600 hover:shadow-xl hover:shadow-ios-blue-500/40"
        >
          <Plus size={22} />
        </button>
        <kbd class="hidden md:flex absolute -top-1 -right-1 w-5 h-5 rounded-md bg-base-200 border border-base-content/10 text-[10px] font-mono font-bold text-base-content/40 items-center justify-center shadow-sm">
          N
        </kbd>
      </div>

      {/* Mobile Bottom Nav — Floating island */}
      <nav class="md:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-50">
        <div class="bg-base-200/80 backdrop-blur-2xl rounded-2xl border border-base-content/[0.06] shadow-lg shadow-black/20">
          <div class="flex items-center justify-around h-14">
            <For each={tabs}>
              {(tab) => (
                <button
                  onClick={() => setActiveTab(tab.id)}
                  class={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all ${
                    activeTab() === tab.id
                      ? 'text-ios-blue-500'
                      : 'text-base-content/30 active:text-base-content/50'
                  }`}
                >
                  <tab.icon size={20} strokeWidth={activeTab() === tab.id ? 2.2 : 1.8} />
                  <span class={`text-[10px] font-medium ${activeTab() === tab.id ? 'text-ios-blue-500' : ''}`}>{tab.label}</span>
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

      {/* Search Modal */}
      <Show when={showSearch()}>
        <SearchModal
          onClose={() => setShowSearch(false)}
          onSelect={(story) => setSearchSelectedStory(story)}
        />
      </Show>

      {/* Story Detail from search */}
      <Show when={searchSelectedStory()}>
        {(story) => (
          <StoryDetail
            story={story()}
            onClose={() => setSearchSelectedStory(null)}
          />
        )}
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
