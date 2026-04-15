import * as d3 from 'd3';

/** Shared host element fields for D3 graphs (zoom, resize, sim stop). */
export type GraphHost = HTMLElement & {
  __tmdGraphRo?: ResizeObserver;
  __tmdGraphResizeT?: ReturnType<typeof setTimeout>;
  __tmdGraphSettleT?: ReturnType<typeof setTimeout>;
  __tmdGraphSimStop?: () => void;
  /** Explorer browse: last computed fit-to-view transform for reset. */
  __tmdBrowseFit?: d3.ZoomTransform;
};

export function disposeGraph(container: HTMLElement) {
  const c = container as GraphHost;
  if (c.__tmdGraphResizeT !== undefined) {
    clearTimeout(c.__tmdGraphResizeT);
    c.__tmdGraphResizeT = undefined;
  }
  if (c.__tmdGraphSettleT !== undefined) {
    clearTimeout(c.__tmdGraphSettleT);
    c.__tmdGraphSettleT = undefined;
  }
  if (c.__tmdGraphRo) {
    c.__tmdGraphRo.disconnect();
    c.__tmdGraphRo = undefined;
  }
  c.__tmdGraphSimStop?.();
  c.__tmdGraphSimStop = undefined;
  c.__tmdBrowseFit = undefined;
  container.querySelectorAll('.graph-zoom-controls').forEach((el) => el.remove());
  container.querySelectorAll('.explorer-overview-empty').forEach((el) => el.remove());
  container.querySelectorAll('.explorer-browse-legend').forEach((el) => el.remove());
}

export function appendPanLayer(
  inner: d3.Selection<SVGGElement, unknown, null, undefined>,
  width: number,
  height: number
) {
  inner
    .append('rect')
    .attr('class', 'tmd-graph-pan-layer')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'transparent')
    .attr('pointer-events', 'all');
}

export function attachNetworkZoom(
  container: HTMLElement,
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  inner: d3.Selection<SVGGElement, unknown, null, undefined>,
  t: (k: string) => string,
  /** When set, Reset uses this transform instead of identity (e.g. fit-to-view). */
  getResetTransform?: () => d3.ZoomTransform,
  /** Called after inner transform is applied (e.g. browse graph label visibility). */
  onZoom?: (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => void
): d3.ZoomBehavior<SVGSVGElement, unknown> {
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.22, 6])
    .filter((event) => {
      if (event.type === 'dblclick') return false;
      if (event.type === 'wheel') {
        const w = event as WheelEvent;
        if (w.ctrlKey) return false;
        w.preventDefault();
        return true;
      }
      if (event.type === 'mousedown') {
        const m = event as MouseEvent;
        if (m.button !== 0) return false;
        const tgt = m.target as Element;
        if (tgt.classList?.contains('tmd-graph-pan-layer')) return true;
        if (tgt.closest?.('.tmd-graph-node')) return false;
        return false;
      }
      if (event.type.startsWith('touch')) return true;
      return false;
    })
    .on('zoom', (event) => {
      inner.attr('transform', event.transform);
      onZoom?.(event);
    });

  svg.call(zoom);

  const cs = getComputedStyle(container);
  if (cs.position === 'static') {
    container.style.position = 'relative';
  }

  const mkBtn = (act: string, text: string, title: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'graph-zoom-btn' + (act === 'reset' ? ' graph-zoom-reset' : '');
    b.dataset.act = act;
    b.setAttribute('aria-label', title);
    b.textContent = text;
    b.title = title;
    return b;
  };

  const bar = document.createElement('div');
  bar.className = 'graph-zoom-controls';
  bar.setAttribute('role', 'toolbar');
  bar.append(
    mkBtn('in', '+', t('graph_zoom_in')),
    mkBtn('out', '−', t('graph_zoom_out')),
    mkBtn('reset', '↺', t('graph_zoom_reset'))
  );
  const hint = document.createElement('span');
  hint.className = 'graph-zoom-hint';
  hint.textContent = t('graph_zoom_hint');
  bar.appendChild(hint);

  bar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn || !bar.contains(btn)) return;
    const act = btn.dataset.act;
    if (act === 'in') svg.transition().duration(160).call(zoom.scaleBy, 1.28);
    else if (act === 'out') svg.transition().duration(160).call(zoom.scaleBy, 1 / 1.28);
    else if (act === 'reset')
      svg.transition().duration(200).call(zoom.transform, getResetTransform?.() ?? d3.zoomIdentity);
  });

  container.appendChild(bar);
  return zoom;
}

/** Fit zoom so a bounding box (data space) sits inside the view with padding; maxScale caps zoom-in. */
export function computeFitTransformFromBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  viewWidth: number,
  viewHeight: number,
  pad: number,
  maxScale = 1
): d3.ZoomTransform {
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (!Number.isFinite(minX) || bw <= 0 || bh <= 0) return d3.zoomIdentity;
  const innerW = Math.max(1, viewWidth - 2 * pad);
  const innerH = Math.max(1, viewHeight - 2 * pad);
  const s = Math.min(innerW / bw, innerH / bh, maxScale);
  const scale = Math.max(0.22, s);
  const tx = (viewWidth - bw * scale) / 2 - minX * scale;
  const ty = (viewHeight - bh * scale) / 2 - minY * scale;
  return d3.zoomIdentity.translate(tx, ty).scale(scale);
}

let tooltipPosRafId = 0;
let tooltipPosPending: { el: HTMLElement; clientX: number; clientY: number } | null = null;

function positionAndClampTooltip(el: HTMLElement, clientX: number, clientY: number) {
  const offX = 22;
  const offY = 12;
  const gap = 12;
  let left = clientX + offX;
  let top = clientY - offY;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  void el.offsetWidth;
  const r = el.getBoundingClientRect();
  let nx = r.left;
  let ny = r.top;
  nx = Math.min(Math.max(gap, nx), window.innerWidth - r.width - gap);
  ny = Math.min(Math.max(gap, ny), window.innerHeight - r.height - gap);
  el.style.left = `${left + (nx - r.left)}px`;
  el.style.top = `${top + (ny - r.top)}px`;
}

export function showTooltip(
  el: HTMLElement | null,
  html: string,
  show: boolean,
  clientX?: number,
  clientY?: number
) {
  if (!el) return;
  if (!show) {
    if (tooltipPosRafId) {
      cancelAnimationFrame(tooltipPosRafId);
      tooltipPosRafId = 0;
    }
    tooltipPosPending = null;
    el.classList.remove('show');
    el.style.maxWidth = '';
    return;
  }
  if (html !== '') {
    if (tooltipPosRafId) {
      cancelAnimationFrame(tooltipPosRafId);
      tooltipPosRafId = 0;
    }
    tooltipPosPending = null;
    el.innerHTML = html;
    el.classList.add('show');
    if (clientX != null && clientY != null) {
      requestAnimationFrame(() => positionAndClampTooltip(el, clientX, clientY));
    }
    return;
  }
  if (clientX == null || clientY == null) return;
  tooltipPosPending = { el, clientX, clientY };
  if (!tooltipPosRafId) {
    tooltipPosRafId = requestAnimationFrame(() => {
      tooltipPosRafId = 0;
      const p = tooltipPosPending;
      tooltipPosPending = null;
      if (p?.el.classList.contains('show')) {
        positionAndClampTooltip(p.el, p.clientX, p.clientY);
      }
    });
  }
}

export function graphInnerWidth(el: HTMLElement): number {
  const cw = el.clientWidth;
  if (cw > 0) return Math.max(320, cw);
  const r = el.getBoundingClientRect();
  const w = Math.round(r.width) || 0;
  return Math.max(320, w || 700);
}

export function attachGraphResize(
  container: HTMLElement,
  layoutWidth: number,
  rerender: () => void
) {
  if (typeof ResizeObserver === 'undefined') return;
  const c = container as GraphHost;
  const ro = new ResizeObserver(() => {
    if (c.__tmdGraphResizeT !== undefined) clearTimeout(c.__tmdGraphResizeT);
    c.__tmdGraphResizeT = setTimeout(() => {
      c.__tmdGraphResizeT = undefined;
      const nw = graphInnerWidth(container);
      if (Math.abs(nw - layoutWidth) < 40) return;
      rerender();
    }, 120);
  });
  c.__tmdGraphRo = ro;
  ro.observe(container);
}
