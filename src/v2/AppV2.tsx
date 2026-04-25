import { createEffect, createSignal, onMount, onCleanup, For, Show, type Component } from 'solid-js';
import { connectRealtime, disconnectRealtime, setRealtimeActor } from './lib/realtime';
import { setActiveTab as setSharedActiveTab } from './lib/activeTab';
import { ClipboardList, Users, FolderKanban, Settings, Sun, Moon, LogOut, Plus, Search, Send, CalendarDays, ListChecks, Archive, BookOpen } from 'lucide-solid';
import dailyIcon from '../assets/daily-icon.png';
import type { ReportCategory, Story } from './types';
import { AuthProvider, useAuth } from './lib/auth';
import { DataProvider, useData } from './lib/data';
import LoginPage from './pages/LoginPage';
import ReportPage from './pages/ReportPage';
import TeamPage from './pages/TeamPage';
import ProjectsPage from './pages/ProjectsPage';
import AdminPage from './pages/AdminPage';
import TasksPage from './pages/TasksPage';
import WikiPage from './pages/WikiPage';
import TokensPage from './pages/TokensPage';
import CreateStoryModal from './components/CreateStoryModal';
import SearchModal from './components/SearchModal';
import CalendarPage from './pages/CalendarPage';
import StoryDetail from './components/StoryDetail';
import InstallPrompt from './components/InstallPrompt';
import AgentBootstrapModal from './components/AgentBootstrapModal';
import UpdateToast from './components/UpdateToast';
import SyncIndicator from './components/SyncIndicator';
import OnlineUsers from './components/OnlineUsers';
import { usePresence } from './lib/presence';
import MobileShell from './mobile/shell/MobileShell';
import Dock from './components/Dock';
import DockIcon from './components/DockIcon';
import { isDark, toggleTheme } from './lib/theme';

type Tab = 'report' | 'team' | 'projects' | 'admin' | 'tasks' | 'wiki' | 'calendar' | 'tokens';

const AppShell: Component = () => {
  const auth = useAuth();
  const user = () => auth.user();

  // Realtime: connect when user is available, disconnect otherwise. Lives
  // above the mobile early-return so both desktop and mobile shells share
  // the same connection — without this, mobile users never receive Centrifugo
  // events and live updates / sync indicator stay silent.
  createEffect(() => {
    const u = user();
    if (u?.team_id) {
      setRealtimeActor(u.id);
      void connectRealtime(u.team_id);
    } else {
      setRealtimeActor(null);
      disconnectRealtime();
    }
  });
  onCleanup(() => disconnectRealtime());

  // Team-wide online presence: every authenticated session beats on the
  // shared `online` scope. Mobile users beat too (so desktop teammates see
  // them in the OnlineUsers widget), but the widget itself only renders
  // on desktop.
  usePresence('online', () => !!user(), () => 'viewing');

  // Default to 'tasks' on mobile, 'report' on desktop
  const isMobile = window.innerWidth < 640;
  if (isMobile) return <MobileShell />;
  const [activeTab, setActiveTab] = createSignal<Tab>(isMobile ? 'tasks' : 'report');
  // Theme is managed by shared lib/theme module
  const [showCreateModal, setShowCreateModal] = createSignal(false);
  const [createCategory, setCreateCategory] = createSignal<ReportCategory | undefined>();
  const [createProjectId, setCreateProjectId] = createSignal<string | undefined>();
  const [createInitialDate, setCreateInitialDate] = createSignal<string | undefined>();
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [showSearch, setShowSearch] = createSignal(false);
  const [searchSelectedStory, setSearchSelectedStory] = createSignal<Story | null>(null);
  const [shareRequested, setShareRequested] = createSignal(0);
  const [hiddenRequested, setHiddenRequested] = createSignal(0);
  const [showAgentBootstrap, setShowAgentBootstrap] = createSignal(false);

  const triggerShare = () => {
    if (activeTab() !== 'report') switchTab('report');
    setShareRequested(k => k + 1);
  };

  const triggerHiddenStories = () => {
    if (activeTab() !== 'report') switchTab('report');
    setHiddenRequested(k => k + 1);
  };

  const openCreateModal = (category?: ReportCategory, projectId?: string, initialDate?: string) => {
    setCreateCategory(category);
    setCreateProjectId(projectId);
    setCreateInitialDate(initialDate);
    setShowCreateModal(true);
  };

  const handleStoryCreated = () => {
    setRefreshKey(k => k + 1);
  };

  // Refresh data when switching tabs so changes from other views are reflected
  const switchTab = (tab: Tab) => {
    if (tab !== activeTab()) {
      setRefreshKey(k => k + 1);
    }
    setActiveTab(tab);
  };


  const baseTabs: { id: Tab; label: string; icon: any; key: string }[] = [
    { id: 'report', label: 'Reporte', icon: ClipboardList, key: 'R' },
    { id: 'team', label: 'Equipo', icon: Users, key: 'E' },
    { id: 'projects', label: 'Proyectos', icon: FolderKanban, key: 'P' },
    { id: 'wiki' as Tab, label: 'Wiki', icon: BookOpen, key: 'W' },
  ];

  const tabs = () => {
    const t = [...baseTabs];
    if (user()?.role === 'admin') {
      t.push({ id: 'admin', label: 'Admin', icon: Settings, key: 'A' });
    }
    return t;
  };

  // Mobile dock: Tasks first (leftmost), then the rest
  const mobileTabs = () => {
    const t: { id: Tab; label: string; icon: any; key: string }[] = [
      { id: 'tasks', label: 'Tareas', icon: ListChecks, key: 'X' },
      ...baseTabs,
    ];
    if (user()?.role === 'admin') {
      t.push({ id: 'admin', label: 'Admin', icon: Settings, key: 'A' });
    }
    return t;
  };

  // Mirror the local activeTab signal into the shared one so pages can tell
  // whether they're the foreground tab and skip realtime refetches if not.
  createEffect(() => setSharedActiveTab(activeTab()));

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
        case 'r': e.preventDefault(); switchTab('report'); break;
        case 'e': e.preventDefault(); switchTab('team'); break;
        case 'p': e.preventDefault(); switchTab('projects'); break;
        case 'a': if (user()?.role === 'admin') { e.preventDefault(); switchTab('admin'); } break;
        case 't': e.preventDefault(); triggerShare(); break;
        case 'w': e.preventDefault(); switchTab('wiki'); break;
        case 'c': e.preventDefault(); switchTab('calendar'); break;
      }
    };
    document.addEventListener('keydown', handleKey);

    const onOpenSearch = () => setShowSearch(true);
    const onOpenShare = () => triggerShare();
    const onOpenHidden = () => triggerHiddenStories();
    const onOpenTokens = () => switchTab('tokens');
    const onOpenAgentBootstrap = () => setShowAgentBootstrap(true);

    window.addEventListener('open-search', onOpenSearch);
    window.addEventListener('open-share', onOpenShare);
    window.addEventListener('open-hidden', onOpenHidden);
    window.addEventListener('open-tokens', onOpenTokens);
    window.addEventListener('open-agent-bootstrap', onOpenAgentBootstrap);

    onCleanup(() => {
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('open-search', onOpenSearch);
      window.removeEventListener('open-share', onOpenShare);
      window.removeEventListener('open-hidden', onOpenHidden);
      window.removeEventListener('open-tokens', onOpenTokens);
      window.removeEventListener('open-agent-bootstrap', onOpenAgentBootstrap);
    });
  });

  return (
    <div class="min-h-screen bg-base-100 text-base-content font-system">
      {/* Global Top Nav has been replaced by Contextual TopNavigation in each page */}

      {/* Content — all pages mounted, toggle visibility to avoid refetch flicker */}
      <main class="max-w-5xl mx-auto px-4 lg:px-6 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <div class={activeTab() === 'report' ? 'stagger-in' : ''} style={{ display: activeTab() === 'report' ? undefined : 'none' }}>
          <ReportPage onCreateStory={(cat) => openCreateModal(cat)} refreshKey={refreshKey()} onStoryDeleted={handleStoryCreated} shareRequested={shareRequested()} hiddenRequested={hiddenRequested()} />
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
        <div class={activeTab() === 'tasks' ? 'stagger-in' : ''} style={{ display: activeTab() === 'tasks' ? undefined : 'none' }}>
          <TasksPage refreshKey={refreshKey()} />
        </div>
        <div class={activeTab() === 'wiki' ? 'stagger-in' : ''} style={{ display: activeTab() === 'wiki' ? undefined : 'none' }}>
          <WikiPage refreshKey={refreshKey()} />
        </div>
        <div class={activeTab() === 'calendar' ? 'stagger-in' : ''} style={{ display: activeTab() === 'calendar' ? undefined : 'none' }}>
          <CalendarPage
             refreshKey={refreshKey()}
             onRequestQuickAdd={(date) => openCreateModal(undefined, undefined, date)}
          />
        </div>
        <div class={activeTab() === 'tokens' ? 'stagger-in' : ''} style={{ display: activeTab() === 'tokens' ? undefined : 'none' }}>
          <TokensPage />
        </div>
      </main>

      {/* =========================================
          DESKTOP macOS Style Dock
          ========================================= */}
      <div class="hidden sm:flex fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-0 right-0 z-50 justify-center pointer-events-none px-0">
        <Dock
          magnification={65}
          distance={140}
          class="bg-base-200/75 backdrop-blur-[32px] saturate-[1.5] rounded-[32px] border border-base-content/[0.08] shadow-[0_12px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.4)] pointer-events-auto p-1.5 flex items-end gap-1.5"
        >
          <For each={tabs()}>
            {(tab) => (
              <DockIcon
                onClick={() => switchTab(tab.id)}
                class="relative flex flex-col items-center justify-center shrink-0 rounded-[26px] transition-colors duration-300 active:scale-95 group cursor-pointer"
              >
                {/* hover/active background */}
                <div class={`absolute inset-0 rounded-[26px] transition-all duration-300 ${activeTab() === tab.id ? 'bg-base-content/5' : 'bg-transparent group-hover:bg-base-content/5'}`} />

                {/* icon container */}
                <div class={`relative z-10 transition-colors duration-200 flex items-center justify-center ${activeTab() === tab.id ? 'text-base-content' : 'text-base-content/50 group-hover:text-base-content/80'}`}>
                  <tab.icon size={22} strokeWidth={activeTab() === tab.id ? 2.5 : 2} />
                </div>

                {/* Active indicator dot */}
                <div class={`absolute bottom-1 w-1 h-1 rounded-full transition-all duration-300 ease-out ${activeTab() === tab.id ? 'bg-ios-blue-500 scale-100 opacity-100' : 'bg-base-content/30 scale-50 opacity-0 group-hover:opacity-40'}`} />

                {/* macOS style tooltip label */}
                <div class="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none flex px-2.5 py-1 bg-base-content/90 dark:bg-base-200/90 text-base-100 dark:text-base-content text-[11px] font-medium rounded-lg shadow-xl translate-y-1 group-hover:translate-y-0 whitespace-nowrap z-50">
                  {tab.label}
                  <kbd class="ml-2 opacity-60 font-mono text-[9px]">{tab.key}</kbd>
                  <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-base-content/90 dark:bg-base-200/90 rotate-45 border-b border-r border-base-content/[0.08]" />
                </div>
              </DockIcon>
            )}
          </For>

          {/* Separator */}
          <div class="w-px h-6 bg-base-content/[0.1] mx-1 shrink-0 rounded-full self-center" />

          {/* Calendar */}
          <DockIcon
            onClick={() => switchTab('calendar')}
            class="relative flex flex-col items-center justify-center shrink-0 rounded-[26px] transition-colors duration-300 active:scale-95 group cursor-pointer"
          >
            <div class={`absolute inset-0 rounded-[26px] transition-all duration-300 ${activeTab() === 'calendar' ? 'bg-base-content/5' : 'bg-transparent group-hover:bg-base-content/5'}`} />
            <div class={`relative z-10 transition-colors duration-200 flex items-center justify-center ${activeTab() === 'calendar' ? 'text-base-content' : 'text-base-content/50 group-hover:text-base-content/80'}`}>
              <CalendarDays size={21} strokeWidth={activeTab() === 'calendar' ? 2.5 : 2} />
            </div>
            <div class={`absolute bottom-1 w-1 h-1 rounded-full transition-all duration-300 ease-out ${activeTab() === 'calendar' ? 'bg-ios-blue-500 scale-100 opacity-100' : 'bg-base-content/30 scale-50 opacity-0 group-hover:opacity-40'}`} />
            <div class="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none flex px-2.5 py-1 bg-base-content/90 dark:bg-base-200/90 text-base-100 dark:text-base-content text-[11px] font-medium rounded-lg shadow-xl translate-y-1 group-hover:translate-y-0 whitespace-nowrap z-50">
              Calendario
              <kbd class="ml-2 opacity-60 font-mono text-[9px]">C</kbd>
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-base-content/90 dark:bg-base-200/90 rotate-45 border-b border-r border-base-content/[0.08]" />
            </div>
          </DockIcon>

          {/* Create FAB */}
          <DockIcon
            onClick={() => openCreateModal()}
            class="relative flex flex-col items-center justify-center shrink-0 rounded-[26px] transition-colors duration-300 active:scale-95 group cursor-pointer"
          >
            <div class="absolute inset-0 rounded-[26px] transition-all duration-300 bg-ios-blue-500/10 group-hover:bg-ios-blue-500/20" />
            <div class="relative z-10 text-ios-blue-500 transition-colors duration-200 flex items-center justify-center">
              <Plus size={22} strokeWidth={2.5} />
            </div>
            <div class="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none flex px-2.5 py-1 bg-base-content/90 dark:bg-base-200/90 text-base-100 dark:text-base-content text-[11px] font-medium rounded-lg shadow-xl translate-y-1 group-hover:translate-y-0 whitespace-nowrap z-50">
              Nueva HU
              <kbd class="ml-2 opacity-60 font-mono text-[9px]">N</kbd>
              <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-base-content/90 dark:bg-base-200/90 rotate-45 border-b border-r border-base-content/[0.08]" />
            </div>
          </DockIcon>
        </Dock>
      </div>

      {/* =========================================
          MOBILE Style Dock 
          ========================================= */}
      <div class="flex sm:hidden fixed bottom-[calc(0.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-50 justify-center pointer-events-none px-4">
        <nav class="w-full max-w-[400px] bg-base-200/85 backdrop-blur-3xl saturate-200 rounded-[28px] border border-base-content/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.15)] pointer-events-auto p-1.5 flex items-center justify-between">
          <div class="flex items-center justify-around flex-1 pl-1">
            <For each={mobileTabs()}>
              {(tab) => (
                <button
                  onClick={() => switchTab(tab.id)}
                  class="relative flex flex-col items-center justify-center w-12 h-12 shrink-0 rounded-[22px] transition-all duration-300 active:scale-90 group"
                  style={{ "-webkit-tap-highlight-color": "transparent" }}
                >
                  <div class={`absolute inset-0 rounded-[22px] transition-all duration-300 ${activeTab() === tab.id ? 'bg-base-content/5' : 'bg-transparent'}`} />

                  <div class={`relative z-10 transition-all duration-300 flex items-center justify-center ${activeTab() === tab.id ? '-translate-y-[4px] text-base-content scale-[1.12]' : 'translate-y-0 text-base-content/40'
                    }`}>
                    <tab.icon size={21} strokeWidth={activeTab() === tab.id ? 2.5 : 2} />
                  </div>

                  <div class={`absolute bottom-1.5 w-1 h-1 rounded-full transition-all duration-300 ease-out ${activeTab() === tab.id ? 'bg-ios-blue-500 scale-100 opacity-100' : 'bg-base-content/30 scale-50 opacity-0'
                    }`} />
                </button>
              )}
            </For>
          </div>

          <div class="w-px h-6 bg-base-content/[0.1] mx-1 shrink-0 rounded-full" />

          {/* Calendar (Mobile) */}
          <button
            onClick={() => setShowCalendar(v => !v)}
            class="relative flex flex-col items-center justify-center w-10 h-12 shrink-0 rounded-[22px] transition-all duration-300 active:scale-90 text-base-content/40"
            style={{ "-webkit-tap-highlight-color": "transparent" }}
          >
            <CalendarDays size={20} strokeWidth={2} />
          </button>

          {/* Create FAB (Mobile) */}
          <button
            onClick={() => openCreateModal()}
            class="relative flex flex-col items-center justify-center w-[48px] h-[48px] shrink-0 rounded-[22px] transition-all duration-300 active:scale-90 group bg-ios-blue-500 text-white ml-0.5"
            style={{ "-webkit-tap-highlight-color": "transparent" }}
          >
            <Plus size={24} strokeWidth={2.5} class="transition-transform group-active:rotate-45" />
          </button>
        </nav>
      </div>

      {/* Create Story Modal */}
      <Show when={showCreateModal()}>
        <CreateStoryModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleStoryCreated}
          defaultCategory={createCategory()}
          defaultProjectId={createProjectId()}
          initialDueDate={createInitialDate()}
        />
      </Show>

      {/* Search Modal */}
      <Show when={showSearch()}>
        <SearchModal
          onClose={() => setShowSearch(false)}
          onSelect={(story) => setSearchSelectedStory(story)}
        />
      </Show>

      {/* Calendar Modal no longer used here; now a page */}

      {/* Story Detail from search */}
      <Show when={searchSelectedStory()}>
        {(story) => (
          <StoryDetail
            story={story()}
            onClose={() => setSearchSelectedStory(null)}
          />
        )}
      </Show>

      {/* Agent bootstrap modal */}
      <Show when={showAgentBootstrap()}>
        <AgentBootstrapModal
          onClose={() => setShowAgentBootstrap(false)}
          onOpenTokens={() => switchTab('tokens')}
        />
      </Show>

      {/* PWA install prompt */}
      <InstallPrompt />

      {/* Realtime sync indicator (top-right, idle = invisible) */}
      <SyncIndicator />

      {/* Online teammates pill (bottom-right, desktop only) */}
      <OnlineUsers />
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
      <UpdateToast />
    </Show>
  );
};

export default AppV2;
