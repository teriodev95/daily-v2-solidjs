import { createResource, onMount, onCleanup, Show, type Component } from 'solid-js';
import type { WikiArticle } from '../types';
import { api } from '../lib/api';
import { useOnceReady } from '../lib/onceReady';
import { X, Maximize2, Minimize2 } from 'lucide-solid';

interface Props {
  projectId: string;
  onSelectArticle?: (articleId: string) => void;
  onClose?: () => void;
}

interface GraphNode {
  id: string;
  name: string;
  tags: string[];
  val?: number;
}

interface GraphLink {
  source: string;
  target: string;
}

const WikiGraph: Component<Props> = (props) => {
  let containerRef!: HTMLDivElement;
  let graphInstance: any = null;

  const [graphData] = createResource(
    () => props.projectId,
    (pid) => api.wiki.graph(pid),
  );

  // Latch — the "Cargando grafo…" overlay only shows on first load. On
  // subsequent refetches the previous graph stays visible.
  const graphReady = useOnceReady(graphData);

  onMount(async () => {
    // Dynamic import to avoid SSR issues
    const ForceGraph = (await import('force-graph')).default;

    const resizeObserver = new ResizeObserver(() => {
      if (graphInstance && containerRef) {
        graphInstance.width(containerRef.clientWidth);
        graphInstance.height(containerRef.clientHeight);
      }
    });

    const initGraph = () => {
      if (!containerRef || graphInstance) return;

      // Detect theme for colors
      const isDark = () => document.documentElement.getAttribute('data-theme')?.includes('dark') ?? true;

      graphInstance = ForceGraph()(containerRef)
        .graphData({ nodes: [], links: [] })
        .nodeLabel('name')
        .nodeColor((node: GraphNode) => {
          const tags = node.tags ?? [];
          if (tags.includes('prompt')) return '#a855f7';
          if (tags.includes('credencial')) return '#ef4444';
          if (tags.includes('procedimiento')) return '#3b82f6';
          if (tags.includes('snippet')) return '#22c55e';
          return isDark() ? '#9ca3af' : '#6b7280';
        })
        .nodeVal((node: GraphNode) => node.val ?? 3)
        .linkColor(() => isDark() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
        .linkWidth(1.5)
        .backgroundColor('transparent')
        .onNodeClick((node: GraphNode) => {
          props.onSelectArticle?.(node.id);
        })
        .onNodeHover((node: GraphNode | null) => {
          containerRef.style.cursor = node ? 'pointer' : 'default';
        })
        .width(containerRef.clientWidth)
        .height(containerRef.clientHeight)
        .cooldownTicks(100)
        .d3AlphaDecay(0.02)
        .d3VelocityDecay(0.15);

      // Spread nodes apart — increase charge repulsion
      graphInstance.d3Force('charge').strength(-300).distanceMax(400);
      graphInstance.d3Force('link').distance(120);
      graphInstance.d3Force('center').strength(0.05);

      // Custom node rendering with labels
      graphInstance.nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const label = node.name;
        const fontSize = Math.max(11 / globalScale, 3);
        const nodeSize = node.val ?? 3;

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
        ctx.fillStyle = graphInstance.nodeColor()(node);
        ctx.fill();

        // Glow effect
        ctx.shadowColor = graphInstance.nodeColor()(node);
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        if (globalScale > 0.7) {
          ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = isDark() ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
          ctx.fillText(label, node.x, node.y + nodeSize + 2);
        }
      });

      resizeObserver.observe(containerRef);
    };

    // Wait for container to be in DOM
    requestAnimationFrame(initGraph);

    // Watch for data changes
    const checkData = setInterval(() => {
      const data = graphData();
      if (data && graphInstance) {
        // Calculate node sizes based on connections
        const connectionCount = new Map<string, number>();
        for (const link of data.links as GraphLink[]) {
          connectionCount.set(link.source, (connectionCount.get(link.source) ?? 0) + 1);
          connectionCount.set(link.target, (connectionCount.get(link.target) ?? 0) + 1);
        }
        const nodes = (data.nodes as GraphNode[]).map(n => ({
          ...n,
          val: 1.5 + (connectionCount.get(n.id) ?? 0) * 0.8,
        }));
        graphInstance.graphData({ nodes, links: data.links });
        clearInterval(checkData);
      }
    }, 100);

    onCleanup(() => {
      clearInterval(checkData);
      resizeObserver.disconnect();
      if (graphInstance) {
        graphInstance._destructor?.();
        graphInstance = null;
      }
    });
  });

  return (
    <div class="relative w-full h-full min-h-[400px] bg-base-100 rounded-2xl border border-base-content/[0.06] overflow-hidden">
      <div ref={containerRef} class="w-full h-full" />

      {/* Legend */}
      <div class="absolute bottom-3 left-3 flex items-center gap-3 text-[9px] font-bold text-base-content/30">
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-purple-500" /> prompt</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500" /> credencial</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-500" /> procedimiento</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500" /> snippet</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-gray-500" /> otro</span>
      </div>

      {/* Close button */}
      <Show when={props.onClose}>
        <button
          onClick={() => props.onClose?.()}
          class="absolute top-3 right-3 p-1.5 rounded-full bg-base-100/80 backdrop-blur-md text-base-content/40 hover:text-base-content/80 hover:bg-base-content/10 transition-all"
        >
          <X size={16} />
        </button>
      </Show>

      {/* Loading — only on first load; refetches keep showing the previous graph. */}
      <Show when={!graphReady()}>
        <div class="absolute inset-0 flex items-center justify-center bg-base-100/50">
          <span class="text-[12px] text-base-content/30">Cargando grafo...</span>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={graphReady() && (graphData() as any)?.nodes?.length === 0}>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-[12px] text-base-content/20">Sin artículos con conexiones</span>
        </div>
      </Show>
    </div>
  );
};

export default WikiGraph;
