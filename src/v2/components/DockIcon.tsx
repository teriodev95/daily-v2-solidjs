import { createMemo, type JSX } from 'solid-js';
import { createDerivedSpring } from '@solid-primitives/spring';
import { useDock } from './Dock';

interface DockIconProps {
  children: JSX.Element;
  class?: string;
  onClick?: () => void;
  style?: JSX.CSSProperties;
}

const BASE_SIZE = 48;

export default function DockIcon(props: DockIconProps) {
  const dock = useDock();
  let ref: HTMLDivElement | undefined;

  const targetSize = createMemo(() => {
    const mx = dock.mouseX();
    if (!ref || mx === Infinity) return BASE_SIZE;

    const rect = ref.getBoundingClientRect();
    const iconCenter = rect.left + rect.width / 2;
    const d = Math.abs(mx - iconCenter);

    if (d >= dock.distance) return BASE_SIZE;

    const scale = 1 + ((dock.magnification - BASE_SIZE) / BASE_SIZE) * (1 - d / dock.distance);
    return BASE_SIZE * scale;
  });

  const springSize = createDerivedSpring(targetSize, {
    stiffness: 0.15,
    damping: 0.7,
  });

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onClick?.();
        }
      }}
      class={props.class}
      style={{
        width: `${springSize()}px`,
        height: `${springSize()}px`,
        ...props.style,
      }}
    >
      {props.children}
    </div>
  );
}
