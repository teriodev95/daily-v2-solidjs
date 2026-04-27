import { Show, For, createSignal, onCleanup, onMount, type Component, type JSX } from 'solid-js';
import { useAuth } from '../lib/auth';
import { Search, Moon, Sun, LogOut, ChevronRight, User as UserIcon, Key, Sparkles } from 'lucide-solid';
import { isDark, toggleTheme } from '../lib/theme';
import dailyIcon from '../../assets/daily-icon.png';

export interface BreadcrumbItem {
  label: string;
  icon?: JSX.Element;
  onClick?: () => void;
}

interface Props {
  breadcrumbs?: BreadcrumbItem[];
  center?: JSX.Element;
  actions?: JSX.Element;
  onSearchClick?: () => void;
  mobileActions?: JSX.Element;
}

const TopNavigation: Component<Props> = (props) => {
  const auth = useAuth();
  const user = () => auth.user();
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);
  let desktopMenuRef: HTMLDivElement | undefined;
  let mobileMenuRef: HTMLDivElement | undefined;

  const handleDocClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (menuOpen() && desktopMenuRef && !desktopMenuRef.contains(target)) {
      setMenuOpen(false);
    }
    if (mobileMenuOpen() && mobileMenuRef && !mobileMenuRef.contains(target)) {
      setMobileMenuOpen(false);
    }
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (menuOpen() || mobileMenuOpen())) {
      setMenuOpen(false);
      setMobileMenuOpen(false);
    }
  };

  onMount(() => {
    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('keydown', handleKey);
    onCleanup(() => {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('keydown', handleKey);
    });
  });

  const openTokens = () => {
    setMenuOpen(false);
    setMobileMenuOpen(false);
    window.dispatchEvent(new Event('open-tokens'));
  };

  const openAgentBootstrap = () => {
    setMenuOpen(false);
    setMobileMenuOpen(false);
    window.dispatchEvent(new Event('open-agent-bootstrap'));
  };

  const doLogout = () => {
    setMenuOpen(false);
    setMobileMenuOpen(false);
    auth.logout();
  };

  return (
    <>
      {/* Desktop Navigation */}
      <header class="hidden md:flex sticky top-0 z-50 pt-2 pb-0 bg-base-100/80 backdrop-blur-md mb-4 -mt-4">
        <div class="flex items-center justify-between pointer-events-none w-full w-full">
          {/* Left Pill (Logo & Title) */}
          <div class="pointer-events-auto h-12 px-3.5 flex items-center gap-3 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <img src={dailyIcon} alt="Daily" class="w-7 h-7 rounded-lg ring-1 ring-black/10" />
            <Show when={props.breadcrumbs && props.breadcrumbs.length > 0}>
              <div class="flex items-center">
                <For each={props.breadcrumbs}>
                  {(crumb, index) => {
                    const isLast = () => index() === props.breadcrumbs!.length - 1;
                    return (
                      <>
                        <ChevronRight size={12} class="text-base-content/20 mx-1" />
                        <span
                          class={`text-[13px] flex items-center gap-1 transition-colors ${
                            isLast()
                              ? 'text-base-content/90 font-bold'
                              : 'text-base-content/40 font-medium cursor-pointer hover:text-base-content'
                          }`}
                          onClick={isLast() ? undefined : crumb.onClick}
                        >
                          <Show when={crumb.icon}>{crumb.icon}</Show>
                          {crumb.label}
                        </span>
                      </>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>

          {/* Center (Contextual Engine) */}
          <div class="pointer-events-auto flex items-center justify-center flex-1 max-w-lg mx-4">
            {props.center}
          </div>

          {/* Right Pill (Actions) */}
          <div class="pointer-events-auto flex h-12 items-center gap-1.5 rounded-[1.25rem] border border-base-content/[0.08] bg-base-200/60 p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-2xl shrink-0">
            {props.actions}
            <Show when={props.actions}>
              <div class="w-px h-4 bg-base-content/[0.08] mx-0.5" />
            </Show>

            <button
              onClick={(event) => toggleTheme({ animate: true, trigger: event.currentTarget })}
              class="inline-flex h-9 w-9 items-center justify-center rounded-[0.9rem] text-base-content/35 transition-all hover:bg-base-content/5 hover:text-base-content/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/30"
              aria-label="Cambiar tema"
            >
              <Show when={isDark()} fallback={<Sun size={15} />}><Moon size={15} /></Show>
            </button>
            <Show when={user()}>
              <div class="flex h-9 items-center gap-1.5 border-l border-base-content/[0.08] pl-1.5 relative" ref={desktopMenuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  class="inline-flex h-9 w-9 items-center justify-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-base-content/20"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen()}
                  title={user()!.name}
                >
                  <img
                    src={user()!.avatar_url!}
                    alt={user()!.name}
                    class="h-8 w-8 rounded-full shadow-sm ring-2 ring-base-content/[0.06] transition-all hover:ring-base-content/20"
                  />
                </button>
                <Show when={menuOpen()}>
                  <div
                    role="menu"
                    class="absolute right-0 top-[calc(100%+0.5rem)] min-w-[200px] bg-base-200/95 backdrop-blur-2xl rounded-xl border border-base-content/[0.08] shadow-lg py-1.5 z-50 origin-top-right"
                  >
                    <div class="px-3 py-2 border-b border-base-content/[0.06] mb-1">
                      <p class="text-xs font-semibold truncate">{user()!.name}</p>
                      <p class="text-[10px] text-base-content/40 truncate">{user()!.email}</p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      disabled
                      title="Próximamente"
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-base-content/40 cursor-not-allowed"
                    >
                      <UserIcon size={14} class="text-base-content/30" />
                      <span class="flex-1 text-left">Mi cuenta</span>
                      <span class="text-[9px] uppercase tracking-wider text-base-content/30">Pronto</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={openTokens}
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-base-content/70 hover:bg-base-content/5 transition-colors"
                    >
                      <Key size={14} class="text-base-content/50" />
                      API Tokens
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={openAgentBootstrap}
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-base-content/70 hover:bg-base-content/5 transition-colors"
                    >
                      <Sparkles size={14} class="text-ios-blue-500/70" />
                      Punto de entrada
                    </button>
                    <div class="my-1 h-px bg-base-content/[0.06]" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={doLogout}
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut size={14} />
                      Cerrar sesión
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <header class="md:hidden sticky top-0 z-50 px-0 pt-2 mb-4 -mt-4">
        <div class="flex items-center justify-between pointer-events-none w-full">
          {/* Left Pill */}
          <div class="pointer-events-auto h-11 px-3.5 flex items-center gap-2 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-[0_8px_24px_rgba(15,23,42,0.08)] max-w-[50%]">
            <img src={dailyIcon} alt="Daily" class="w-6 h-6 rounded-md ring-1 ring-black/10 shrink-0" />
            <Show when={props.breadcrumbs && props.breadcrumbs.length > 0}>
              <span class="font-bold text-[13px] tracking-tight text-base-content/90 truncate">
                {props.breadcrumbs![props.breadcrumbs!.length - 1].label}
              </span>
            </Show>
          </div>

          {/* Right Pill */}
          <div class="pointer-events-auto h-11 px-1.5 flex items-center gap-0.5 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-[0_8px_24px_rgba(15,23,42,0.08)] shrink-0">
            <Show when={props.onSearchClick}>
              <button onClick={props.onSearchClick} class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 transition-all">
                <Search size={16} />
              </button>
            </Show>
            {/* Mobile contextual actions */}
            <Show when={props.mobileActions}>
              {props.mobileActions}
              <div class="w-px h-4 bg-base-content/[0.08] mx-0.5" />
            </Show>
            {/* Mobile simplified actions, just theme and avatar */}
            <button
              onClick={() => toggleTheme()}
              class="p-2 rounded-xl text-base-content/35 transition-all hover:text-base-content/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue-500/30"
            >
              <Show when={isDark()} fallback={<Sun size={15} />}><Moon size={15} /></Show>
            </button>
            <Show when={user()}>
              <div class="ml-0.5 pl-1.5 border-l border-base-content/[0.08] relative" ref={mobileMenuRef}>
                <button
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  class="rounded-full focus:outline-none focus:ring-2 focus:ring-base-content/20 transition-all"
                  aria-haspopup="menu"
                  aria-expanded={mobileMenuOpen()}
                  aria-label="Menú de usuario"
                >
                  <img src={user()!.avatar_url!} alt="" class="w-6 h-6 rounded-full ring-2 ring-base-content/[0.06] shadow-sm" />
                </button>
                <Show when={mobileMenuOpen()}>
                  <div
                    role="menu"
                    class="absolute right-0 top-[calc(100%+0.5rem)] min-w-[200px] bg-base-200/95 backdrop-blur-2xl rounded-xl border border-base-content/[0.08] shadow-lg py-1.5 z-50"
                  >
                    <div class="px-3 py-2 border-b border-base-content/[0.06] mb-1">
                      <p class="text-xs font-semibold truncate">{user()!.name}</p>
                      <p class="text-[10px] text-base-content/40 truncate">{user()!.email}</p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      disabled
                      title="Próximamente"
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-base-content/40 cursor-not-allowed"
                    >
                      <UserIcon size={14} class="text-base-content/30" />
                      <span class="flex-1 text-left">Mi cuenta</span>
                      <span class="text-[9px] uppercase tracking-wider text-base-content/30">Pronto</span>
                    </button>
                    <button
                      type="button"
                      onClick={openTokens}
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-base-content/70 hover:bg-base-content/5 transition-colors"
                    >
                      <Key size={14} class="text-base-content/50" />
                      API Tokens
                    </button>
                    <button
                      type="button"
                      onClick={openAgentBootstrap}
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-base-content/70 hover:bg-base-content/5 transition-colors"
                    >
                      <Sparkles size={14} class="text-ios-blue-500/70" />
                      Punto de entrada
                    </button>
                    <div class="my-1 h-px bg-base-content/[0.06]" />
                    <button
                      type="button"
                      onClick={doLogout}
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut size={14} />
                      Cerrar sesión
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
        
        {/* Mobile Center Expansion */}
        <Show when={props.center}>
          <div class="mt-2 pointer-events-auto w-full">
            {props.center}
          </div>
        </Show>
      </header>
    </>
  );
};

export default TopNavigation;
