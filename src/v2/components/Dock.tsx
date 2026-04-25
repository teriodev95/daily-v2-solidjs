import { createSignal, createContext, useContext, type JSX, type Accessor } from 'solid-js';

interface DockContextType {
  mouseX: Accessor<number>;
  magnification: number;
  distance: number;
}

const DockContext = createContext<DockContextType>();

export function useDock() {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error('DockIcon must be used within a <Dock> component');
  return ctx;
}

interface DockProps {
  children: JSX.Element;
  magnification?: number;
  distance?: number;
  class?: string;
  elementRef?: (element: HTMLElement) => void;
}

export default function Dock(props: DockProps) {
  const [mouseX, setMouseX] = createSignal(Infinity);

  return (
    <DockContext.Provider value={{
      mouseX,
      get magnification() { return props.magnification ?? 65; },
      get distance() { return props.distance ?? 140; },
    }}>
      <nav
        ref={(element) => props.elementRef?.(element)}
        onMouseMove={(e) => setMouseX(e.clientX)}
        onMouseLeave={() => setMouseX(Infinity)}
        class={props.class}
      >
        {props.children}
      </nav>
    </DockContext.Provider>
  );
}
