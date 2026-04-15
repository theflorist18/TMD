import * as d3 from 'd3';

export const TYPE_COLORS: Record<string, string> = {
  CP: '#c0c0c0',
  ID: '#5db8d9',
  IS: '#f59e0b',
  IB: '#e8e8e8',
  SC: '#67e8f9',
  MF: '#f97316',
  OT: '#a78bfa',
  PF: '#f472b6',
  FD: '#888',
  '': '#444',
};

export const GRAPH_LINK_STROKE = 'rgba(93, 184, 217, 0.55)';

export function graphNodeFillForType(tp: string) {
  const base = TYPE_COLORS[tp] || TYPE_COLORS[''];
  const c = d3.color(base);
  if (!c) return base;
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  if (lum > 0.5) return c.darker(0.75 + (lum - 0.5) * 1.5).formatHex();
  return base;
}

export function graphNodeStrokeForFill(fillHex: string) {
  const c = d3.color(fillHex);
  if (!c) return null;
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  return lum > 0.48 ? 'rgba(0,0,0,0.42)' : null;
}
