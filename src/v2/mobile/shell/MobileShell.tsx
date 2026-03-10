import { createSignal, Show, type Component } from 'solid-js';
import { CalendarDays, LogOut, Moon, Plus, Send, Sun } from 'lucide-solid';
import dailyIcon from '../../../assets/daily-icon.png';
import { useAuth } from '../../lib/auth';
import MobileTodayPage from '../pages/MobileTodayPage';
import MobileCalendarPage from '../pages/MobileCalendarPage';
import MobileQuickAddSheet from '../components/MobileQuickAddSheet';
import InstallPrompt from '../../components/InstallPrompt';

type MobileTab = 'today' | 'calendar';

const MobileShell: Component = () => {
  const auth = useAuth();
  const savedTheme = localStorage.getItem('dc-theme') || 'ios-dark';
  const [isDark, setIsDark] = createSignal(savedTheme === 'ios-dark');
  const [activeTab, setActiveTab] = createSignal<MobileTab>('today');
  const [showQuickAdd, setShowQuickAdd] = createSignal(false);
  const [refreshKey, setRefreshKey] = createSignal(0);

  const toggleTheme = () => {
    const next = !isDark();
    setIsDark(next);
    const theme = next ? 'ios-dark' : 'ios';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dc-theme', theme);
  };

  const handleCreated = () => {
    setRefreshKey(value => value + 1);
    setActiveTab('today');
  };

  return (
    <div class="sm:hidden min-h-screen bg-base-100 text-base-content">
      <header class="sticky top-0 z-[120] px-3 pt-3">
        <div class="mx-auto flex items-center justify-between gap-3">
          <div class="h-12 px-3.5 flex items-center gap-2 bg-base-200/70 backdrop-blur-2xl rounded-[1.35rem] border border-base-content/[0.08] shadow-sm">
            <img src={dailyIcon} alt="Daily Check" class="w-6 h-6 rounded-md ring-1 ring-black/10" />
            <div class="flex flex-col">
              <span class="font-semibold text-sm tracking-tight text-base-content/90 leading-tight">Daily Check</span>
              <span class="text-[9px] text-base-content/25 font-medium leading-none">mobile focus</span>
            </div>
          </div>

          <div class="h-12 px-1.5 flex items-center gap-1 bg-base-200/70 backdrop-blur-2xl rounded-[1.35rem] border border-base-content/[0.08] shadow-sm">
            <button
              onClick={toggleTheme}
              class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 hover:bg-base-content/5 transition-all"
            >
              <Show when={isDark()} fallback={<Sun size={16} />}>
                <Moon size={16} />
              </Show>
            </button>
            <button
              onClick={() => auth.logout()}
              class="p-2 rounded-xl text-base-content/35 hover:text-red-500 hover:bg-red-500/10 transition-all"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
            <Show when={auth.user()}>
              <img
                src={auth.user()!.avatar_url!}
                alt={auth.user()!.name}
                class="w-7 h-7 rounded-full ring-2 ring-base-content/[0.06] shadow-sm"
              />
            </Show>
          </div>
        </div>
      </header>

      <main class="px-3 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <div style={{ display: activeTab() === 'today' ? undefined : 'none' }}>
          <MobileTodayPage refreshKey={refreshKey()} />
        </div>
        <div style={{ display: activeTab() === 'calendar' ? undefined : 'none' }}>
          <MobileCalendarPage refreshKey={refreshKey()} />
        </div>
      </main>

      <div class="fixed inset-x-0 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-[130] px-4 pointer-events-none">
        <nav class="mx-auto max-w-[420px] pointer-events-auto rounded-[30px] border border-base-content/[0.08] bg-base-200/88 backdrop-blur-3xl shadow-[0_10px_36px_rgba(0,0,0,0.18)] p-2">
          <div class="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <button
              onClick={() => { setActiveTab('today'); setShowQuickAdd(false); }}
              class={`h-14 rounded-[22px] flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                activeTab() === 'today'
                  ? 'bg-base-content text-base-100 shadow-md shadow-base-content/15'
                  : 'text-base-content/45 hover:bg-base-content/[0.04]'
              }`}
            >
              <Send size={17} />
              Hoy
            </button>
            <button
              onClick={() => { setActiveTab('calendar'); setShowQuickAdd(false); }}
              class={`h-14 rounded-[22px] flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                activeTab() === 'calendar'
                  ? 'bg-base-content text-base-100 shadow-md shadow-base-content/15'
                  : 'text-base-content/45 hover:bg-base-content/[0.04]'
              }`}
            >
              <CalendarDays size={17} />
              Calendario
            </button>
            <button
              onClick={() => setShowQuickAdd(open => !open)}
              class={`w-14 h-14 rounded-[22px] flex items-center justify-center transition-all ${
                showQuickAdd()
                  ? 'bg-base-content text-base-100'
                  : 'bg-ios-blue-500 text-white shadow-lg shadow-ios-blue-500/25'
              }`}
            >
              <Plus size={24} strokeWidth={2.5} />
            </button>
          </div>
        </nav>
      </div>

      <MobileQuickAddSheet
        open={showQuickAdd()}
        onClose={() => setShowQuickAdd(false)}
        onCreated={handleCreated}
      />

      <InstallPrompt />
    </div>
  );
};

export default MobileShell;
