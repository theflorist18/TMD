/** Shared zoom / focus behavior for Explorer browse graph and detail force graphs. */

import type { Simulation, SimulationNodeDatum } from 'd3';
import { esc } from '@/lib/format';

export const DETAIL_ZOOM_LABEL_K = 1.75;
export const DETAIL_CLICK_PIN_MS = 280;
export const DETAIL_PAN_CLICK_MAX_DIST = 10;

/** Delay clearing graph hover so brief gaps between nodes do not flicker focus. */
export const GRAPH_HOVER_CLEAR_MS = 100;

/**
 * Delay syncing the Explorer detail table to graph hover so layout reflow does not
 * move the SVG under the pointer (which retriggers mouseenter/leave and “jitter”).
 */
export const GRAPH_TABLE_FOCUS_DEBOUNCE_MS = 180;

/**
 * Advance a force simulation synchronously until alpha drops (Fruchterman–Reingold–style settle).
 * Use before building SVG so network diagrams stay static (no live tick / no node drag).
 */
export function runForceSimulationStatic(
  sim: Simulation<SimulationNodeDatum, undefined>,
  options?: { maxTicks?: number; alphaEnd?: number; beforeTick?: () => void }
): void {
  const maxTicks = options?.maxTicks ?? 520;
  const alphaEnd = options?.alphaEnd ?? 1e-3;
  sim.alpha(1).restart();
  for (let i = 0; i < maxTicks; i++) {
    options?.beforeTick?.();
    sim.tick();
    if (sim.alpha() < alphaEnd) break;
  }
  sim.alphaTarget(0);
  sim.stop();
}

/** Default edge stroke opacity with no hover/pin (quiet hairlines). */
export const NETWORK_LINK_BASE_OPACITY = 0.36;

export function linkEndpointResolved(
  src: unknown,
  tgt: unknown
): [string, string] {
  const idOf = (x: unknown) =>
    typeof x === 'string'
      ? x
      : x && typeof x === 'object' && 'id' in (x as object)
        ? String((x as { id: string }).id)
        : '';
  return [idOf(src), idOf(tgt)];
}

/** Undirected adjacency from link list (D3 may resolve nodes to objects later). */
export function buildAdjacencyUndirected(
  links: Array<{ source: unknown; target: unknown }>
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!a || !b) return;
    if (!m.has(a)) m.set(a, new Set());
    m.get(a)!.add(b);
  };
  for (const l of links) {
    const [s, t] = linkEndpointResolved(l.source, l.target);
    add(s, t);
    add(t, s);
  }
  return m;
}

export function focusNeighborSet(
  adj: Map<string, Set<string>>,
  centerId: string | null
): Set<string> {
  const out = new Set<string>();
  if (!centerId) return out;
  out.add(centerId);
  const n = adj.get(centerId);
  if (n) for (const id of n) out.add(id);
  return out;
}

/** Short interaction line under color swatches on Explorer network legends. */
export function appendExplorerGraphLegendHint(
  legendEl: HTMLElement,
  t: (key: string) => string
): void {
  const p = document.createElement('p');
  p.className = 'explorer-browse-legend-hint';
  p.textContent = t('explorer_net_legend_hint');
  legendEl.appendChild(p);
}

/** Color swatch + i18n key — same legend DOM for browse overview and detail force graphs. */
export type ExplorerNetworkLegendItem = {
  color: string;
  labelKey:
    | 'explorer_net_legend_grp'
    | 'explorer_net_legend_mem'
    | 'explorer_net_legend_stk'
    | 'explorer_net_legend_inv';
};

/** Group network: hub → members → tickers (browse overview group mode + group detail). */
export const EXPLORER_LEGEND_GROUP: ExplorerNetworkLegendItem[] = [
  { color: 'var(--purple)', labelKey: 'explorer_net_legend_grp' },
  { color: 'var(--accent-soft)', labelKey: 'explorer_net_legend_mem' },
  { color: 'var(--green)', labelKey: 'explorer_net_legend_stk' },
];

/** Bipartite investor ↔ stock (browse investor/stock tabs + investor detail). */
export const EXPLORER_LEGEND_INV_STK: ExplorerNetworkLegendItem[] = [
  { color: 'var(--accent)', labelKey: 'explorer_net_legend_inv' },
  { color: 'var(--green)', labelKey: 'explorer_net_legend_stk' },
];

/** Stock-centric hub: ticker first, then investor (stock detail). */
export const EXPLORER_LEGEND_STK_INV: ExplorerNetworkLegendItem[] = [
  { color: 'var(--green)', labelKey: 'explorer_net_legend_stk' },
  { color: 'var(--accent)', labelKey: 'explorer_net_legend_inv' },
];

/** Mounts the standard Explorer network legend + interaction hint under the graph. */
export function mountExplorerNetworkLegend(
  container: HTMLElement,
  t: (key: string) => string,
  items: ExplorerNetworkLegendItem[]
): void {
  const leg = document.createElement('div');
  leg.className = 'explorer-browse-legend';
  leg.setAttribute('role', 'group');
  leg.setAttribute('aria-label', t('explorer_net_legend_aria'));
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'explorer-browse-legend-item';
    const sw = document.createElement('span');
    sw.className = 'explorer-browse-legend-swatch';
    sw.style.background = it.color;
    const tx = document.createElement('span');
    tx.className = 'explorer-browse-legend-label';
    tx.textContent = t(it.labelKey);
    row.append(sw, tx);
    leg.appendChild(row);
  }
  appendExplorerGraphLegendHint(leg, t);
  container.appendChild(leg);
}

/** Tooltip block: highlight, clear, double-click unhighlight (all Explorer network graphs). */
export function explorerNetworkTooltipHintsHtml(t: (key: string) => string): string {
  return `<div class="tt-hint">${esc(t('explorer_net_tt_click_select'))}<br /><span class="tt-hint-muted">${esc(t('explorer_net_tt_click_clear'))}<br />${esc(t('explorer_net_tt_dblclick_unhighlight'))}</span></div>`;
}

export function linkEndpointsInFocusNeighborhood(a: string, b: string, fs: Set<string>): boolean {
  return fs.has(a) && fs.has(b);
}

/** Stroke opacity when a focus node is set vs free exploration. */
export function networkLinkStrokeOpacity(
  center: string | null,
  a: string,
  b: string,
  fs: Set<string>,
  unfocusedOpacity = NETWORK_LINK_BASE_OPACITY
): number {
  if (!center) return unfocusedOpacity;
  return linkEndpointsInFocusNeighborhood(a, b, fs) ? 0.92 : 0.08;
}

/**
 * Scale link width in focus mode: full weight on edges inside the 1-hop neighborhood,
 * thinner on edges that leave that subgraph.
 */
export function networkLinkWidthFocusFactor(
  center: string | null,
  a: string,
  b: string,
  fs: Set<string>,
  opts?: { bright?: number; dim?: number }
): number {
  const bright = opts?.bright ?? 1.35;
  const dim = opts?.dim ?? 0.45;
  if (!center) return 1;
  return linkEndpointsInFocusNeighborhood(a, b, fs) ? bright : dim;
}

/** On-graph labels: show whole graph at high zoom, or center ∪ neighbors when focused. */
export function networkGraphLabelsVisible(
  center: string | null,
  inFocusNeighborhood: boolean,
  showAllFromZoom: boolean
): boolean {
  return center ? inFocusNeighborhood : showAllFromZoom;
}
