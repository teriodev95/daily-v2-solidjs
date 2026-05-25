import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import { api } from '../lib/api';
import { useOnceReady } from '../lib/onceReady';
import { Circle, Crosshair, Eye, EyeOff, Focus, Network, Route, Search, X } from 'lucide-solid';

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
  degree?: number;
  isIndex?: boolean;
  rank?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

type ScopeMode = 'global' | 'local1' | 'local2';

const labelLimit = 42;

const getNodeId = (value: string | GraphNode) =>
  typeof value === 'string' ? value : value.id;

const normalizeIndexValue = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const normalizeGraphValue = (value: string) =>
  normalizeIndexValue(value).replace(/[-_]+/g, ' ');

const isIndexNode = (node: GraphNode) =>
  normalizeIndexValue(node.name) === '_indice' ||
  (node.tags ?? []).some((tag) => normalizeIndexValue(tag) === '_indice');

const shorten = (value: string, limit = labelLimit) =>
  value.length > limit ? `${value.slice(0, limit - 1)}…` : value;

const nodeColor = (node: GraphNode, isDark: boolean) => {
  const tags = node.tags ?? [];
  if (node.isIndex) return isDark ? '#a78bfa' : '#7c3aed';
  if (tags.includes('prompt')) return '#a855f7';
  if (tags.includes('credencial')) return '#ef4444';
  if (tags.includes('procedimiento')) return '#3b82f6';
  if (tags.includes('snippet')) return '#22c55e';
  if (tags.includes('rust')) return '#f97316';
  if (tags.includes('database') || tags.includes('base de datos')) return '#14b8a6';
  if (tags.includes('ai') || tags.includes('ai-agents') || tags.includes('ai agents')) return '#8b5cf6';
  return isDark ? '#94a3b8' : '#64748b';
};

const WikiGraph: Component<Props> = (props) => {
  let containerRef!: HTMLDivElement;
  let graphInstance: any = null;

  const [graphMounted, setGraphMounted] = createSignal(0);
  const [showIndexNode, setShowIndexNode] = createSignal(false);
  const [showOrphans, setShowOrphans] = createSignal(false);
  const [showAllLabels, setShowAllLabels] = createSignal(false);
  const [scopeMode, setScopeMode] = createSignal<ScopeMode>('global');
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null);
  const [hoverNodeId, setHoverNodeId] = createSignal<string | null>(null);
  const [graphQuery, setGraphQuery] = createSignal('');

  const [graphData, { refetch }] = createResource(
    () => ({ pid: props.projectId, includeIndex: showIndexNode() }),
    ({ pid, includeIndex }) => api.wiki.graph(pid, { includeIndex }),
  );

  const graphReady = useOnceReady(graphData);

  const isDark = () =>
    document.documentElement.getAttribute('data-theme')?.includes('dark') ?? true;

  const preparedGraph = createMemo(() => {
    const raw = graphData() as { nodes?: GraphNode[]; links?: GraphLink[]; meta?: { duplicate_edges?: number; index_nodes_excluded?: number; raw_links?: number } } | undefined;
    const rawNodes = raw?.nodes ?? [];
    const rawLinks = raw?.links ?? [];

    const query = normalizeGraphValue(graphQuery());
    const baseNodes = rawNodes.map((node, rank) => ({ ...node, rank, isIndex: isIndexNode(node) }));
    const baseAllowedIds = new Set(
      baseNodes
        .filter((node) => showIndexNode() || !node.isIndex)
        .map((node) => node.id),
    );

    const dedupedLinks: { source: string; target: string }[] = [];
    const seenEdges = new Set<string>();
    for (const link of rawLinks) {
      const source = getNodeId(link.source);
      const target = getNodeId(link.target);
      if (!source || !target || source === target) continue;
      if (!baseAllowedIds.has(source) || !baseAllowedIds.has(target)) continue;
      const key = `${source}->${target}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      dedupedLinks.push({ source, target });
    }

    const globalDegree = new Map<string, number>();
    for (const link of dedupedLinks) {
      globalDegree.set(link.source, (globalDegree.get(link.source) ?? 0) + 1);
      globalDegree.set(link.target, (globalDegree.get(link.target) ?? 0) + 1);
    }

    const matchesQuery = (node: GraphNode) => {
      if (!query) return true;
      const haystack = normalizeGraphValue(`${node.name} ${(node.tags ?? []).join(' ')}`);
      return haystack.includes(query);
    };

    const allowedIds = new Set(
      baseNodes
        .filter((node) => baseAllowedIds.has(node.id))
        .filter(matchesQuery)
        .filter((node) => showOrphans() || query || node.isIndex || (globalDegree.get(node.id) ?? 0) > 0)
        .map((node) => node.id),
    );

    let visibleIds = new Set(allowedIds);
    const selected = selectedNodeId();
    const scope = scopeMode();
    if (selected && scope !== 'global' && baseAllowedIds.has(selected)) {
      visibleIds = new Set([selected]);
      const depth = scope === 'local1' ? 1 : 2;
      let frontier = new Set([selected]);
      for (let step = 0; step < depth; step += 1) {
        const next = new Set<string>();
        for (const link of dedupedLinks) {
          if (frontier.has(link.source) && baseAllowedIds.has(link.target)) next.add(link.target);
          if (frontier.has(link.target) && baseAllowedIds.has(link.source)) next.add(link.source);
        }
        for (const id of next) visibleIds.add(id);
        frontier = next;
      }
      for (const node of baseNodes) {
        if (!matchesQuery(node)) visibleIds.delete(node.id);
      }
    }

    const visibleLinks = dedupedLinks.filter((link) => visibleIds.has(link.source) && visibleIds.has(link.target));
    const degree = new Map<string, number>();
    for (const link of visibleLinks) {
      degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
      degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
    }

    const nodes = baseNodes
      .filter((node) => visibleIds.has(node.id))
      .map((node) => {
        const d = degree.get(node.id) ?? 0;
        return {
          ...node,
          degree: d,
          val: Math.min(node.isIndex ? 10 : 9, 4.8 + Math.log1p(d) * 2.1),
        };
      });

    const connectedIds = new Set<string>();
    for (const link of dedupedLinks) {
      connectedIds.add(link.source);
      connectedIds.add(link.target);
    }
    const hiddenOrphans = baseNodes
      .filter((node) => baseAllowedIds.has(node.id) && !connectedIds.has(node.id))
      .length;

    return {
      nodes,
      links: visibleLinks,
      stats: {
        rawNodes: rawNodes.length,
        rawLinks: rawLinks.length,
        visibleNodes: nodes.length,
        uniqueLinks: dedupedLinks.length,
        visibleLinks: visibleLinks.length,
        hiddenOrphans: showOrphans() || query ? 0 : hiddenOrphans,
        duplicateEdges: raw?.meta?.duplicate_edges ?? Math.max(0, rawLinks.length - dedupedLinks.length),
        indexHidden: !showIndexNode() && ((raw?.meta?.index_nodes_excluded ?? 0) > 0 || baseNodes.some((node) => node.isIndex)),
      },
    };
  });

  const selectedNode = createMemo(() => {
    const id = selectedNodeId();
    if (!id) return null;
    return preparedGraph().nodes.find((node) => node.id === id) ?? null;
  });

  const topNodes = createMemo(() =>
    [...preparedGraph().nodes]
      .filter((node) => !node.isIndex)
      .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
      .slice(0, 8),
  );

  const sidePanelTitle = createMemo(() =>
    preparedGraph().links.length > 0 ? 'Hubs' : graphQuery() ? 'Resultados' : 'Documentos',
  );

  const centerGraph = () => {
    if (!graphInstance || !containerRef) return;
    graphInstance.zoomToFit(450, 92);
  };

  onMount(() => {
    let disposed = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    onCleanup(() => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      if (graphInstance) {
        graphInstance._destructor?.();
        graphInstance = null;
      }
    });

    const bootGraph = async () => {
      const ForceGraph = (await import('force-graph')).default as unknown as () => (el: HTMLElement) => any;
      if (disposed) return;

      resizeObserver = new ResizeObserver(() => {
        if (!graphInstance || !containerRef) return;
        graphInstance.width(containerRef.clientWidth);
        graphInstance.height(containerRef.clientHeight);
        graphInstance.zoomToFit?.(250, 82);
      });

      const initGraph = () => {
        if (disposed || !containerRef || graphInstance) return;

        graphInstance = ForceGraph()(containerRef)
          .graphData({ nodes: [], links: [] })
          .nodeLabel((node: GraphNode) => node.name)
          .nodeVal((node: GraphNode) => node.val ?? 3)
          .linkColor(() => isDark() ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.18)')
          .linkWidth((link: any) => {
            const selected = selectedNodeId();
            if (!selected) return 1;
            return getNodeId(link.source) === selected || getNodeId(link.target) === selected ? 1.8 : 0.8;
          })
          .backgroundColor('transparent')
          .onNodeClick((node: GraphNode, event: MouseEvent) => {
            setSelectedNodeId(node.id);
            if (event.detail > 1) props.onSelectArticle?.(node.id);
          })
          .onNodeHover((node: GraphNode | null) => {
            setHoverNodeId(node?.id ?? null);
            containerRef.style.cursor = node ? 'pointer' : 'default';
          })
          .width(containerRef.clientWidth)
          .height(containerRef.clientHeight)
          .cooldownTicks(80)
          .d3AlphaDecay(0.025)
          .d3VelocityDecay(0.22);

        graphInstance.d3Force('charge').strength(-130).distanceMax(320);
        graphInstance.d3Force('link').distance((link: any) => {
          const sourceDegree = (link.source as GraphNode)?.degree ?? 0;
          const targetDegree = (link.target as GraphNode)?.degree ?? 0;
          return Math.max(92, 148 - Math.min(42, Math.max(sourceDegree, targetDegree) * 3));
        });
        graphInstance.d3Force('center').strength(0.045);

        graphInstance.nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const selected = selectedNodeId() === node.id;
        const hovered = hoverNodeId() === node.id;
        const degree = node.degree ?? 0;
        const radius = node.val ?? 3;
        const color = nodeColor(node, isDark());
          const noLinks = preparedGraph().links.length === 0;
          const shouldLabel =
          showAllLabels() ||
          selected ||
          hovered ||
          (globalScale > 0.95 && degree >= 2) ||
          (noLinks && globalScale > 0.95 && (node.rank ?? 99) < 12);

        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = color;
        ctx.globalAlpha = node.isIndex ? 0.78 : 0.92;
        ctx.fill();
        ctx.strokeStyle = isDark() ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.22)';
        ctx.lineWidth = 1.1 / globalScale;
        ctx.stroke();

        if (selected || hovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + (selected ? 5 : 3), 0, 2 * Math.PI, false);
          ctx.strokeStyle = color;
          ctx.globalAlpha = selected ? 0.52 : 0.32;
          ctx.lineWidth = selected ? 2 : 1.5;
          ctx.stroke();
        }

        ctx.globalAlpha = 1;
        if (shouldLabel) {
          const label = shorten(node.name);
          const fontSize = Math.max(11 / globalScale, 5);
          ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
          const textWidth = ctx.measureText(label).width;
          const padX = 5 / globalScale;
          const padY = 3 / globalScale;
          const boxW = textWidth + padX * 2;
          const boxH = fontSize + padY * 2;
          const boxX = node.x - boxW / 2;
          const boxY = node.y + radius + 5 / globalScale;

          ctx.fillStyle = isDark() ? 'rgba(10,10,10,0.76)' : 'rgba(255,255,255,0.86)';
          ctx.strokeStyle = isDark() ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)';
          ctx.lineWidth = 1 / globalScale;
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, 6 / globalScale);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = isDark() ? 'rgba(255,255,255,0.82)' : 'rgba(15,23,42,0.78)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, node.x, boxY + boxH / 2);
        }
        ctx.restore();
        });

        resizeObserver?.observe(containerRef);
        setGraphMounted((value) => value + 1);
      };

      frame = requestAnimationFrame(initGraph);
    };

    void bootGraph();
  });

  createEffect(() => {
    graphMounted();
    const graph = preparedGraph();
    if (!graphInstance) return;
    graphInstance.graphData({ nodes: graph.nodes, links: graph.links });
    window.setTimeout(() => centerGraph(), 120);
  });

  createEffect(() => {
    selectedNodeId();
    hoverNodeId();
    showAllLabels();
    if (graphInstance?.refresh) graphInstance.refresh();
  });

  createEffect(() => {
    const selected = selectedNodeId();
    if (!selected) return;
    if (!preparedGraph().nodes.some((node) => node.id === selected)) {
      setSelectedNodeId(null);
      setScopeMode('global');
    }
  });

  return (
    <div class="relative w-full h-full min-h-[440px] bg-base-100 rounded-2xl border border-base-content/[0.06] overflow-hidden">
      <div ref={containerRef} class="w-full h-full" role="img" aria-label="Grafo navegable de relaciones de wiki" />

      <div class="absolute left-3 top-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
        <div class="pointer-events-auto flex max-w-[calc(100%-2.5rem)] flex-wrap items-center gap-1.5 rounded-2xl border border-base-content/[0.08] bg-base-100/88 px-2 py-2 shadow-sm backdrop-blur-xl">
          <label class="flex h-8 w-[178px] shrink-0 items-center gap-2 rounded-xl bg-base-content/[0.045] px-2.5 text-base-content/42">
            <Search size={13} />
            <input
              value={graphQuery()}
              onInput={(event) => setGraphQuery(event.currentTarget.value)}
              placeholder="Filtrar nodos"
              class="min-w-0 flex-1 bg-transparent text-[12px] font-semibold text-base-content/75 placeholder:text-base-content/32 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setScopeMode('global')}
            aria-pressed={scopeMode() === 'global'}
            class={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-colors ${scopeMode() === 'global' ? 'bg-base-content/10 text-base-content' : 'text-base-content/45 hover:bg-base-content/[0.05] hover:text-base-content/75'}`}
          >
            <Network size={12} />
            Global
          </button>
          <Show when={selectedNodeId()}>
            <button
              type="button"
              onClick={() => setScopeMode('local1')}
              aria-pressed={scopeMode() === 'local1'}
              class={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-colors ${scopeMode() === 'local1' ? 'bg-ios-blue-500/12 text-ios-blue-500' : 'text-base-content/45 hover:bg-base-content/[0.05] hover:text-base-content/75'}`}
            >
              1 salto
            </button>
            <button
              type="button"
              onClick={() => setScopeMode('local2')}
              aria-pressed={scopeMode() === 'local2'}
              class={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-colors ${scopeMode() === 'local2' ? 'bg-ios-blue-500/12 text-ios-blue-500' : 'text-base-content/45 hover:bg-base-content/[0.05] hover:text-base-content/75'}`}
            >
              2 saltos
            </button>
          </Show>
          <span class="mx-0.5 h-5 w-px bg-base-content/[0.08]" />
          <button
            type="button"
            onClick={() => setShowOrphans((value) => !value)}
            aria-pressed={showOrphans()}
            class={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-colors ${showOrphans() ? 'bg-base-content/10 text-base-content' : 'text-base-content/45 hover:bg-base-content/[0.05] hover:text-base-content/75'}`}
          >
            <Circle size={12} />
            Aislados
          </button>
          <button
            type="button"
            onClick={() => setShowIndexNode((value) => !value)}
            aria-pressed={showIndexNode()}
            class={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-colors ${showIndexNode() ? 'bg-purple-500/12 text-purple-500' : 'text-base-content/45 hover:bg-base-content/[0.05] hover:text-base-content/75'}`}
          >
            {showIndexNode() ? <Eye size={12} /> : <EyeOff size={12} />}
            Indice
          </button>
          <button
            type="button"
            onClick={() => setShowAllLabels((value) => !value)}
            aria-pressed={showAllLabels()}
            class={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-colors ${showAllLabels() ? 'bg-base-content/10 text-base-content' : 'text-base-content/45 hover:bg-base-content/[0.05] hover:text-base-content/75'}`}
          >
            Labels
          </button>
          <button
            type="button"
            onClick={centerGraph}
            aria-label="Centrar grafo"
            title="Centrar grafo"
            class="flex h-8 w-8 items-center justify-center rounded-xl text-base-content/45 transition-colors hover:bg-base-content/[0.05] hover:text-base-content/75"
          >
            <Crosshair size={12} />
          </button>
        </div>

        <Show when={props.onClose}>
          <button
            type="button"
            onClick={() => props.onClose?.()}
            aria-label="Cerrar grafo"
            class="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-base-100/86 text-base-content/40 shadow-sm backdrop-blur-xl transition-colors hover:bg-base-content/10 hover:text-base-content/80"
          >
            <X size={15} />
          </button>
        </Show>
      </div>

      <div class="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] pointer-events-none">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-base-content/[0.06] bg-base-100/78 px-3 py-2 text-[10px] font-bold text-base-content/34 backdrop-blur-xl">
          <span>{preparedGraph().stats.visibleNodes} visibles</span>
          <span>{preparedGraph().stats.visibleLinks} relaciones</span>
          <Show when={preparedGraph().stats.hiddenOrphans > 0}>
            <span>{preparedGraph().stats.hiddenOrphans} aislados ocultos</span>
          </Show>
          <Show when={preparedGraph().stats.indexHidden}>
            <span class="text-purple-500/70">indice oculto</span>
          </Show>
        </div>
      </div>

      <Show when={!selectedNode() && topNodes().length > 0}>
        <div class="absolute bottom-[3.7rem] right-3 max-h-[220px] w-[min(270px,calc(100%-1.5rem))] overflow-y-auto rounded-2xl border border-base-content/[0.08] bg-base-100/88 p-3 shadow-sm backdrop-blur-xl sm:bottom-3">
          <div class="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-base-content/35">
            <Route size={12} />
            {sidePanelTitle()}
          </div>
          <div class="space-y-1">
            <For each={topNodes()}>
              {(node) => (
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(node.id)}
                  class="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-base-content/[0.04]"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <span
                      class="h-2 w-2 shrink-0 rounded-full"
                      style={{ 'background-color': nodeColor(node, isDark()) }}
                    />
                    <span class="truncate text-[11px] font-semibold text-base-content/66">{node.name}</span>
                  </span>
                  <span class="shrink-0 text-[10px] font-bold text-base-content/30">{node.degree}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={selectedNode()}>
        {(node) => (
          <div class="absolute bottom-3 right-3 top-[4.6rem] w-[min(320px,calc(100%-1.5rem))] rounded-2xl border border-base-content/[0.08] bg-base-100/92 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div class="mb-3 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-base-content/35">
                  Seleccion
                </p>
                <h3 class="mt-1 line-clamp-3 text-[14px] font-bold leading-snug text-base-content/88">
                  {node().name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedNodeId(null); setScopeMode('global'); }}
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base-content/35 transition-colors hover:bg-base-content/[0.06] hover:text-base-content/75"
                aria-label="Quitar seleccion"
              >
                <X size={14} />
              </button>
            </div>

            <div class="mb-3 flex flex-wrap gap-1.5">
              <For each={(node().tags ?? []).filter((tag) => tag !== '_índice').slice(0, 6)}>
                {(tag) => (
                  <span class="max-w-full truncate rounded-lg bg-base-content/[0.055] px-2 py-1 text-[10px] font-bold text-base-content/50">
                    {tag}
                  </span>
                )}
              </For>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="rounded-xl bg-base-content/[0.035] px-3 py-2">
                <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/30">Relaciones</p>
                <p class="mt-1 text-[17px] font-black text-base-content/82">{node().degree ?? 0}</p>
              </div>
              <div class="rounded-xl bg-base-content/[0.035] px-3 py-2">
                <p class="text-[10px] font-bold uppercase tracking-[0.12em] text-base-content/30">Vista</p>
                <p class="mt-1 text-[12px] font-bold text-base-content/65">{scopeMode() === 'global' ? 'Global' : scopeMode() === 'local1' ? '1 salto' : '2 saltos'}</p>
              </div>
            </div>

            <div class="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => props.onSelectArticle?.(node().id)}
                class="flex-1 rounded-xl bg-ios-blue-500 px-3 py-2 text-[12px] font-bold text-white shadow-sm transition-transform active:scale-[0.98]"
              >
                Abrir doc
              </button>
              <button
                type="button"
                onClick={() => setScopeMode(scopeMode() === 'local1' ? 'local2' : 'local1')}
                class="inline-flex items-center gap-1.5 rounded-xl bg-base-content/[0.055] px-3 py-2 text-[12px] font-bold text-base-content/65 transition-colors hover:bg-base-content/[0.08]"
              >
                <Focus size={13} />
                Expandir
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={graphData.error}>
        <div class="absolute inset-0 z-10 flex items-center justify-center bg-base-100/72 px-6 text-center backdrop-blur-sm">
          <div>
            <p class="text-[14px] font-bold text-base-content/70">No se pudo cargar el grafo</p>
            <p class="mt-1 max-w-[320px] text-[12px] leading-relaxed text-base-content/40">La vista conserva el indice, pero la red necesita reintentar la consulta.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              class="mt-4 rounded-xl bg-ios-blue-500 px-4 py-2 text-[12px] font-bold text-white shadow-sm transition-transform active:scale-[0.98]"
            >
              Reintentar
            </button>
          </div>
        </div>
      </Show>

      <Show when={!graphReady() && !graphData.error}>
        <div class="absolute inset-0 flex items-center justify-center bg-base-100/60 backdrop-blur-sm">
          <span class="text-[12px] font-semibold text-base-content/35">Cargando grafo...</span>
        </div>
      </Show>

      <Show when={graphReady() && !graphData.error && preparedGraph().nodes.length === 0}>
        <div class="absolute inset-0 flex items-center justify-center px-6 text-center">
          <div>
            <p class="text-[14px] font-bold text-base-content/68">
              {graphQuery() ? 'Sin coincidencias' : 'Sin relaciones visibles'}
            </p>
            <p class="mt-1 max-w-[320px] text-[12px] leading-relaxed text-base-content/38">
              {graphQuery()
                ? 'No hay nodos que coincidan con el filtro actual.'
                : 'El mapa oculta documentos aislados para evitar ruido visual.'}
            </p>
            <div class="mt-4 flex flex-wrap justify-center gap-2">
              <Show when={graphQuery()}>
                <button
                  type="button"
                  onClick={() => setGraphQuery('')}
                  class="rounded-xl bg-base-content/[0.06] px-4 py-2 text-[12px] font-bold text-base-content/65 transition-colors hover:bg-base-content/[0.1]"
                >
                  Limpiar filtro
                </button>
              </Show>
              <button
                type="button"
                onClick={() => setShowOrphans(true)}
                class="rounded-xl bg-base-content/[0.06] px-4 py-2 text-[12px] font-bold text-base-content/65 transition-colors hover:bg-base-content/[0.1]"
              >
                Mostrar aislados
              </button>
              <button
                type="button"
                onClick={() => { setShowIndexNode(true); void refetch(); }}
                class="rounded-xl bg-purple-500/14 px-4 py-2 text-[12px] font-bold text-purple-500 transition-colors hover:bg-purple-500/20"
              >
                Activar indice
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default WikiGraph;
