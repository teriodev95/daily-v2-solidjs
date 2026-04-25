import { createSignal } from 'solid-js';

const savedTheme = localStorage.getItem('dc-theme') || 'ios-dark';
const [isDark, setIsDark] = createSignal(savedTheme === 'ios-dark');
const THEME_TRANSITION_STYLE_ID = 'dc-theme-switch-base-style';
const THEME_TRANSITION_DURATION = 650;
const THEME_TRANSITION_EASING = 'ease-in-out';
let transitionInProgress = false;

export { isDark };

interface ToggleThemeOptions {
  animate?: boolean;
  trigger?: HTMLElement | null;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const applyTheme = (dark: boolean) => {
  setIsDark(dark);
  const theme = dark ? 'ios-dark' : 'ios';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('dc-theme', theme);
};

const ensureTransitionStyles = () => {
  if (document.getElementById(THEME_TRANSITION_STYLE_ID)) return;
  const isHighResolution = window.innerWidth >= 3000 || window.innerHeight >= 2000;
  const style = document.createElement('style');
  style.id = THEME_TRANSITION_STYLE_ID;
  style.textContent = `
    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation: none;
      mix-blend-mode: normal;
      ${isHighResolution ? 'transform: translateZ(0);' : ''}
    }

    ${isHighResolution ? `
      ::view-transition-group(root),
      ::view-transition-image-pair(root),
      ::view-transition-old(root),
      ::view-transition-new(root) {
        backface-visibility: hidden;
        perspective: 1000px;
        transform: translate3d(0, 0, 0);
      }
    ` : ''}
  `;
  document.head.appendChild(style);
};

const getTransitionOrigin = (trigger?: HTMLElement | null) => {
  if (!trigger) return { x: window.innerWidth / 2, y: window.innerHeight - 76 };
  const rect = trigger.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

const maxRadiusFrom = (x: number, y: number) => Math.max(
  Math.hypot(x, y),
  Math.hypot(window.innerWidth - x, y),
  Math.hypot(x, window.innerHeight - y),
  Math.hypot(window.innerWidth - x, window.innerHeight - y),
);

export function toggleTheme(options: ToggleThemeOptions = {}) {
  if (transitionInProgress) return;
  const next = !isDark();

  const transitionDocument = document as ViewTransitionDocument;
  if (!options.animate || prefersReducedMotion() || !transitionDocument.startViewTransition) {
    applyTheme(next);
    return;
  }

  ensureTransitionStyles();
  const { x, y } = getTransitionOrigin(options.trigger);
  const radius = maxRadiusFrom(x, y);
  const isHighResolution = window.innerWidth >= 3000 || window.innerHeight >= 2000;
  const duration = isHighResolution
    ? Math.max(THEME_TRANSITION_DURATION * 0.8, 500)
    : THEME_TRANSITION_DURATION;
  transitionInProgress = true;
  const transition = transitionDocument.startViewTransition(() => applyTheme(next));

  transition.ready
    .then(() => {
      const animation = document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration,
          easing: THEME_TRANSITION_EASING,
          pseudoElement: '::view-transition-new(root)',
        },
      );
      animation.finished.finally(() => {
        transitionInProgress = false;
      });
    })
    .catch(() => {
      transitionInProgress = false;
    });

  transition.finished.finally(() => {
    transitionInProgress = false;
  });
}
