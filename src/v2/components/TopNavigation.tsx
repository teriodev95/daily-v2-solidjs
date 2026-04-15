import { Show, For, type Component, type JSX } from 'solid-js';
import { useAuth } from '../lib/auth';
import { Search, Moon, Sun, LogOut, ChevronRight } from 'lucide-solid';
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

  return (
    <>
      {/* Desktop Navigation */}
      <header class="hidden md:flex sticky top-0 z-50 pt-2 pb-0 bg-base-100/80 backdrop-blur-md mb-4 -mt-4">
        <div class="flex items-center justify-between pointer-events-none w-full w-full">
          {/* Left Pill (Logo & Title) */}
          <div class="pointer-events-auto h-12 px-3.5 flex items-center gap-3 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-sm">
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
          <div class="pointer-events-auto h-12 px-2 flex items-center gap-1 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.12)] shrink-0">
            {props.actions}
            <Show when={props.actions}>
              <div class="w-px h-4 bg-base-content/[0.08] mx-0.5" />
            </Show>
            
            <button onClick={toggleTheme} class="p-2.5 rounded-xl text-base-content/35 hover:text-base-content/60 hover:bg-base-content/5 transition-all">
              <Show when={isDark()} fallback={<Sun size={15} />}><Moon size={15} /></Show>
            </button>
            <button onClick={() => auth.logout()} class="p-2.5 rounded-xl text-base-content/35 hover:text-red-500 hover:bg-red-500/10 transition-all" title="Cerrar sesión">
              <LogOut size={15} />
            </button>
            <Show when={user()}>
              <div class="ml-1 pl-2 border-l border-base-content/[0.08]">
                <img src={user()!.avatar_url!} alt={user()!.name} class="w-7 h-7 rounded-full ring-2 ring-base-content/[0.06] shadow-sm" />
              </div>
            </Show>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <header class="md:hidden sticky top-0 z-50 px-0 pt-2 mb-4 -mt-4">
        <div class="flex items-center justify-between pointer-events-none w-full">
          {/* Left Pill */}
          <div class="pointer-events-auto h-11 px-3.5 flex items-center gap-2 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-sm max-w-[50%]">
            <img src={dailyIcon} alt="Daily" class="w-6 h-6 rounded-md ring-1 ring-black/10 shrink-0" />
            <Show when={props.breadcrumbs && props.breadcrumbs.length > 0}>
              <span class="font-bold text-[13px] tracking-tight text-base-content/90 truncate">
                {props.breadcrumbs![props.breadcrumbs!.length - 1].label}
              </span>
            </Show>
          </div>

          {/* Right Pill */}
          <div class="pointer-events-auto h-11 px-1.5 flex items-center gap-0.5 bg-base-200/60 backdrop-blur-2xl rounded-[1.25rem] border border-base-content/[0.08] shadow-sm shrink-0">
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
            <button onClick={toggleTheme} class="p-2 rounded-xl text-base-content/35 hover:text-base-content/60 transition-all">
              <Show when={isDark()} fallback={<Sun size={15} />}><Moon size={15} /></Show>
            </button>
            <Show when={user()}>
              <div class="ml-0.5 pl-1.5 border-l border-base-content/[0.08]">
                <img src={user()!.avatar_url!} alt="" class="w-6 h-6 rounded-full ring-2 ring-base-content/[0.06] shadow-sm" />
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
