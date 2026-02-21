import { createSignal, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import { ClipboardList, Users, FolderKanban, Settings, Sun, Moon, LogOut, Plus, Search, FileText, Send } from 'lucide-solid';
import type { ReportCategory, Story } from './types';
import { AuthProvider, useAuth } from './lib/auth';
import { DataProvider, useData } from './lib/data';
import LoginPage from './pages/LoginPage';
import ReportPage from './pages/ReportPage';
import TeamPage from './pages/TeamPage';
import ProjectsPage from './pages/ProjectsPage';
import AdminPage from './pages/AdminPage';
import CreateStoryModal from './components/CreateStoryModal';
import CreateAssignmentModal from './components/CreateAssignmentModal';
import SearchModal from './components/SearchModal';
import StoryDetail from './components/StoryDetail';

type Tab = 'report' | 'team' | 'projects' | 'admin';

const AppShell: Component = () => {
  const auth = useAuth();
  const [activeTab, setActiveTab] = createSignal<Tab>('report');
  const savedTheme = localStorage.getItem('dc-theme') || 'ios-dark';
  const [isDark, setIsDark] = createSignal(savedTheme === 'ios-dark');
  const [showCreateModal, setShowCreateModal] = createSignal(false);
  const [createCategory, setCreateCategory] = createSignal<ReportCategory | undefined>();
  const [createProjectId, setCreateProjectId] = createSignal<string | undefined>();
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [showSearch, setShowSearch] = createSignal(false);
  const [searchSelectedStory, setSearchSelectedStory] = createSignal<Story | null>(null);
  const [showAssignmentModal, setShowAssignmentModal] = createSignal(false);
  const [fabOpen, setFabOpen] = createSignal(false);

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

  const baseTabs: { id: Tab; label: string; icon: any; key: string }[] = [
    { id: 'report', label: 'Reporte', icon: ClipboardList, key: 'R' },
    { id: 'team', label: 'Equipo', icon: Users, key: 'E' },
    { id: 'projects', label: 'Proyectos', icon: FolderKanban, key: 'P' },
  ];

  const tabs = () => {
    const t = [...baseTabs];
    if (user()?.role === 'admin') {
      t.push({ id: 'admin', label: 'Admin', icon: Settings, key: 'A' });
    }
    return t;
  };

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
        case 'r': e.preventDefault(); setActiveTab('report'); break;
        case 'e': e.preventDefault(); setActiveTab('team'); break;
        case 'p': e.preventDefault(); setActiveTab('projects'); break;
        case 'a': if (user()?.role === 'admin') { e.preventDefault(); setActiveTab('admin'); } break;
      }
    };
    document.addEventListener('keydown', handleKey);
    // Close FAB popover on outside click (mobile)
    const handleOutsideClick = (e: MouseEvent) => {
      if (fabOpen() && !(e.target as HTMLElement).closest('[data-fab-menu]')) {
        setFabOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    onCleanup(() => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('click', handleOutsideClick);
    });
  });

  return (
    <div class="min-h-screen bg-base-100 text-base-content font-system">

      {/* Floating Top Bar */}
      <header class="sticky top-0 z-50 px-3 pt-3 hidden md:block">
        <div class="max-w-5xl mx-auto flex items-center justify-between pointer-events-none">
          {/* Left Pill (Logo) */}
          <div class="pointer-events-auto h-12 px-4 flex items-center gap-2.5 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
            <div class="w-7 h-7 rounded-lg bg-ios-blue-500 flex items-center justify-center text-white font-bold text-xs ring-1 ring-black/10">
              D
            </div>
            <span class="font-semibold text-sm tracking-tight">Daily Check</span>
          </div>

          {/* Right Pill (Actions) */}
          <div class="pointer-events-auto h-12 px-2 flex items-center gap-1 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
            <button
              onClick={() => setShowSearch(true)}
              class="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-base-content/25 hover:text-base-content/50 hover:bg-base-content/5 transition-all"
              title="Buscar (⌘K)"
            >
              <Search size={14} />
              <span class="text-[10px] text-base-content/20 hidden lg:inline">Buscar</span>
              <kbd class="hidden lg:flex text-[9px] text-base-content/15 border border-base-content/[0.08] rounded px-1 py-px font-mono">⌘K</kbd>
            </button>
            <div class="w-px h-4 bg-base-content/[0.08] mx-0.5" />
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
              <div class="ml-1 pl-2 border-l border-base-content/[0.08]">
                <img
                  src={user()!.avatar_url!}
                  alt={user()!.name}
                  class="w-7 h-7 rounded-full ring-2 ring-base-content/[0.06] shadow-sm"
                />
              </div>
            </Show>
          </div>
        </div>
      </header>

      {/* Mobile Top Bar — minimal */}
      <header class="md:hidden sticky top-0 z-50 px-3 pt-2">
        <div class="flex items-center justify-between pointer-events-none">
          {/* Left Pill (Logo) */}
          <div class="pointer-events-auto h-11 px-3.5 flex items-center gap-2 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-sm">
            <div class="w-6 h-6 rounded-md bg-ios-blue-500 flex items-center justify-center text-white font-bold text-[10px] ring-1 ring-black/10">
              D
            </div>
            <span class="font-semibold text-sm tracking-tight text-base-content/90">Daily Check</span>
          </div>

          {/* Right Pill (Actions) */}
          <div class="pointer-events-auto h-11 px-1.5 flex items-center gap-0.5 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-sm">
            <button
              onClick={() => setShowSearch(true)}
              class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 hover:bg-base-content/5 transition-all"
              title="Buscar"
            >
              <Search size={16} />
            </button>
            <button
              onClick={toggleTheme}
              class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 hover:bg-base-content/5 transition-all"
            >
              <Show when={isDark()} fallback={<Sun size={15} />}>
                <Moon size={15} />
              </Show>
            </button>
            <Show when={user()}>
              <div class="ml-0.5 pl-1.5 border-l border-base-content/[0.08]">
                <img
                  src={user()!.avatar_url!}
                  alt={user()!.name}
                  class="w-6 h-6 rounded-full ring-2 ring-base-content/[0.06] shadow-sm"
                />
              </div>
            </Show>
          </div>
        </div>
      </header>

      {/* Content — all pages mounted, toggle visibility to avoid refetch flicker */}
      <main class="max-w-5xl mx-auto px-4 lg:px-6 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <div class={activeTab() === 'report' ? 'stagger-in' : ''} style={{ display: activeTab() === 'report' ? undefined : 'none' }}>
          <ReportPage onCreateStory={(cat) => openCreateModal(cat)} refreshKey={refreshKey()} onStoryDeleted={handleStoryCreated} />
        </div>
        <div class={activeTab() === 'team' ? 'stagger-in' : ''} style={{ display: activeTab() === 'team' ? undefined : 'none' }}>
          <TeamPage />
        </div>
        <div class={activeTab() === 'projects' ? 'stagger-in' : ''} style={{ display: activeTab() === 'projects' ? undefined : 'none' }}>
          <ProjectsPage onCreateStory={(projId) => openCreateModal(undefined, projId)} refreshKey={refreshKey()} onStoryDeleted={handleStoryCreated} />
        </div>
        <Show when={user()?.role === 'admin'}>
          <div class={activeTab() === 'admin' ? 'stagger-in' : ''} style={{ display: activeTab() === 'admin' ? undefined : 'none' }}>
            <AdminPage />
          </div>
        </Show>
      </main>

      {/* universal macOS Style Dock */}
      <div class="fixed bottom-[calc(0.5rem+env(safe-area-inset-bottom))] sm:bottom-[calc(1rem+env(safe-area-inset-bottom))] left-0 right-0 z-50 flex justify-center pointer-events-none px-2 sm:px-0">
        <nav class="bg-base-200/75 backdrop-blur-[32px] saturate-[1.5] rounded-[24px] sm:rounded-[32px] border border-base-content/[0.08] shadow-lg sm:shadow-[0_12px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.4)] pointer-events-auto p-1 sm:p-1.5 flex items-center gap-0.5 sm:gap-1.5 max-w-full overflow-x-auto scrollbar-none">
          <For each={tabs()}>
            {(tab) => (
              <button
                onClick={() => setActiveTab(tab.id)}
                class="relative flex flex-col items-center justify-center w-[44px] h-[44px] sm:w-12 sm:h-12 shrink-0 rounded-2xl sm:rounded-xl transition-all duration-300 active:scale-95 group"
                style={{
                  "-webkit-tap-highlight-color": "transparent"
                }}
                title={tab.label}
              >
                {/* hover/active background */}
                <div class={`absolute inset-0 rounded-2xl sm:rounded-xl transition-all duration-300 ${activeTab() === tab.id ? 'bg-base-content/5' : 'bg-transparent group-hover:bg-base-content/5'}`} />

                {/* icon container with bounce */}
                <div class={`relative z-10 transition-all duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-center ${activeTab() === tab.id ? '-translate-y-[5px] sm:-translate-y-1.5 text-base-content scale-110' : 'translate-y-0 text-base-content/50 group-hover:text-base-content/80 group-hover:-translate-y-1 group-hover:scale-110'
                  }`}>
                  <tab.icon size={22} strokeWidth={activeTab() === tab.id ? 2.5 : 2} class="hidden sm:block" />
                  <tab.icon size={20} strokeWidth={activeTab() === tab.id ? 2.5 : 2} class="sm:hidden" />
                </div>

                {/* Active indicator dot */}
                <div class={`absolute bottom-1 w-1 h-1 sm:w-1 sm:h-1 rounded-full transition-all duration-300 ease-out ${activeTab() === tab.id ? 'bg-ios-blue-500 scale-100 opacity-100' : 'bg-base-content/30 scale-50 opacity-0 group-hover:opacity-40'
                  }`} />

                {/* macOS style tooltip label (desktop only) */}
                <div class="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none hidden sm:flex px-2.5 py-1 bg-base-content/90 dark:bg-base-200/90 text-base-100 dark:text-base-content text-[11px] font-medium rounded-lg shadow-xl translate-y-1 group-hover:translate-y-0 whitespace-nowrap">
                  {tab.label}
                  <kbd class="ml-2 opacity-60 font-mono text-[9px]">{tab.key}</kbd>
                  <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-base-content/90 dark:bg-base-200/90 rotate-45 border-b border-r border-base-content/[0.08]" />
                </div>
              </button>
            )}
          </For>

          {/* Separator */}
          <div class="w-px h-5 sm:h-6 bg-base-content/[0.1] mx-0.5 sm:mx-1 shrink-0 rounded-full" />

          {/* Create FAB with popover menu */}
          <div
            class="relative shrink-0"
            data-fab-menu
          >
            {/* Popover — click-based, stays open until outside click */}
            <div
              class={`absolute bottom-full mb-2.5 right-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${fabOpen()
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 translate-y-2 pointer-events-none'
                }`}
            >
              <div class="relative bg-base-200/90 backdrop-blur-2xl rounded-2xl border border-base-content/[0.08] shadow-[0_12px_40px_rgba(0,0,0,0.25)] p-1.5 min-w-[160px]">
                <button
                  onClick={() => { setFabOpen(false); openCreateModal(); }}
                  class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-medium text-base-content/70 hover:bg-base-content/[0.06] hover:text-base-content transition-all group/item"
                >
                  <div class="w-7 h-7 rounded-lg bg-ios-blue-500/12 flex items-center justify-center group-hover/item:bg-ios-blue-500/20 transition-colors">
                    <FileText size={14} class="text-ios-blue-500" />
                  </div>
                  <div class="text-left">
                    <span class="block leading-tight">Historia de usuario</span>
                    <span class="block text-[9px] text-base-content/25 font-normal">Tarea de desarrollo</span>
                  </div>
                </button>
                <button
                  onClick={() => { setFabOpen(false); setShowAssignmentModal(true); }}
                  class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-medium text-base-content/70 hover:bg-base-content/[0.06] hover:text-base-content transition-all group/item"
                >
                  <div class="w-7 h-7 rounded-lg bg-purple-500/12 flex items-center justify-center group-hover/item:bg-purple-500/20 transition-colors">
                    <Send size={14} class="text-purple-500" />
                  </div>
                  <div class="text-left">
                    <span class="block leading-tight">Encomienda</span>
                    <span class="block text-[9px] text-base-content/25 font-normal">Encomienda al equipo</span>
                  </div>
                </button>
                {/* Arrow */}
                <div class="absolute -bottom-1 right-5 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto w-2.5 h-2.5 bg-base-200/90 rotate-45 border-b border-r border-base-content/[0.08]" />
              </div>
            </div>

            {/* FAB Button */}
            <button
              onClick={() => setFabOpen(!fabOpen())}
              class="relative flex flex-col items-center justify-center w-[44px] h-[44px] sm:w-12 sm:h-12 rounded-2xl sm:rounded-xl transition-all duration-300 active:scale-95 group"
              style={{ "-webkit-tap-highlight-color": "transparent" }}
            >
              <div class={`absolute inset-0 rounded-2xl sm:rounded-xl transition-all duration-300 ${fabOpen() ? 'bg-ios-blue-500/20' : 'bg-ios-blue-500/10 group-hover:bg-ios-blue-500/20'}`} />
              <div class={`relative z-10 text-ios-blue-500 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-center ${fabOpen() ? 'rotate-45 scale-110' : 'group-hover:-translate-y-1 group-hover:scale-110'
                }`}>
                <Plus size={22} strokeWidth={2.5} class="hidden sm:block" />
                <Plus size={20} strokeWidth={2.5} class="sm:hidden" />
              </div>
            </button>
          </div>
        </nav>
      </div>

      {/* Create Story Modal */}
      <Show when={showCreateModal()}>
        <CreateStoryModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleStoryCreated}
          defaultCategory={createCategory()}
          defaultProjectId={createProjectId()}
        />
      </Show>

      {/* Create Assignment Modal */}
      <Show when={showAssignmentModal()}>
        <CreateAssignmentModal
          onClose={() => setShowAssignmentModal(false)}
          onCreated={handleStoryCreated}
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
