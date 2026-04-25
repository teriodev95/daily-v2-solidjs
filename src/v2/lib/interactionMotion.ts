export type InteractionMotionSource = 'report' | 'kanban' | 'detail' | 'theme';
export type InteractionMotionTone = 'success' | 'theme';

interface PlaySuccessOptions {
  source?: InteractionMotionSource;
  tone?: InteractionMotionTone;
}

const DURATION = 420;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export class InteractionMotionController {
  private dockElement: HTMLElement | null = null;
  private cleanupTimers = new Set<number>();

  mountDock(element: HTMLElement) {
    this.dockElement = element;
    element.dataset.interactionMotionDock = 'true';

    return () => {
      if (this.dockElement === element) {
        delete element.dataset.interactionMotionDock;
        this.dockElement = null;
      }
    };
  }

  playSuccess(options: PlaySuccessOptions = {}) {
    if (!this.canAnimate()) return;

    const dock = this.dockElement;
    if (!dock) return;

    const layer = document.createElement('span');
    const tone = options.tone ?? (options.source === 'theme' ? 'theme' : 'success');
    const color = tone === 'theme'
      ? 'rgba(0, 122, 255, 0.30)'
      : 'rgba(52, 199, 89, 0.32)';
    const edgeColor = tone === 'theme'
      ? 'rgba(0, 122, 255, 0.12)'
      : 'rgba(52, 199, 89, 0.12)';

    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.interactionMotionSource = options.source ?? tone;
    Object.assign(layer.style, {
      position: 'absolute',
      inset: '-22% -16%',
      zIndex: '0',
      pointerEvents: 'none',
      borderRadius: 'inherit',
      opacity: '0',
      transform: 'translate3d(0, 14px, 0) scaleX(0.72)',
      transformOrigin: '50% 100%',
      filter: 'blur(10px)',
      contain: 'layout paint style',
      background: `radial-gradient(ellipse at 50% 88%, ${color} 0%, ${edgeColor} 38%, transparent 72%)`,
    });

    dock.prepend(layer);

    const animation = layer.animate(
      [
        { opacity: 0, transform: 'translate3d(0, 16px, 0) scaleX(0.70)', filter: 'blur(12px)' },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scaleX(1)', filter: 'blur(8px)', offset: 0.42 },
        { opacity: 0, transform: 'translate3d(0, -10px, 0) scaleX(1.12)', filter: 'blur(14px)' },
      ],
      { duration: DURATION, easing: EASING, fill: 'forwards' },
    );

    const cleanup = () => {
      animation.cancel();
      layer.remove();
    };
    animation.finished.then(cleanup).catch(cleanup);

    const timer = window.setTimeout(() => {
      this.cleanupTimers.delete(timer);
      cleanup();
    }, DURATION + 120);
    this.cleanupTimers.add(timer);
  }

  dispose() {
    for (const timer of this.cleanupTimers) window.clearTimeout(timer);
    this.cleanupTimers.clear();
    this.dockElement
      ?.querySelectorAll('[data-interaction-motion-source]')
      .forEach((element) => element.remove());
    this.dockElement = null;
  }

  private canAnimate() {
    if (typeof window === 'undefined') return false;
    if (!this.dockElement?.isConnected) return false;
    if (!window.matchMedia('(min-width: 640px)').matches) return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return true;
  }
}

export const interactionMotion = new InteractionMotionController();

export const playInteractionSuccess = (options?: PlaySuccessOptions) => {
  interactionMotion.playSuccess(options);
};
