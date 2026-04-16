import * as d3 from 'd3';
import { TYPE_COLORS } from '@/charts/d3common';

export type IntelProfile = {
  name: string;
  type_code?: string;
  local_foreign?: string;
  nationality?: string;
  domicile?: string;
  portfolio_size?: number;
  classification?: string;
  avg_pct?: number;
  group_id?: string;
  risk_flags?: string[];
};

export type IntelStockLfConcentration = {
  code: string;
  issuer: string;
  localSum: number;
  foreignSum: number;
};

export function renderIntelCharts(
  intelProfiles: IntelProfile[],
  helpers: {
    t: (k: string) => string;
    typeLabel: (code: string) => string;
  }
) {
  const { t, typeLabel } = helpers;
  renderIntelTypeDonut(intelProfiles, typeLabel);
  renderIntelLFBar(intelProfiles, t);
  renderIntelNatBar(intelProfiles);
}

const STOCK_LF_LOCAL = '#5db8d9';
const STOCK_LF_FOREIGN = '#c0c0c0';

/** Scroll-wide SVG: one column per stock, two vertical bars (local / foreign), shared Y scale. */
export function renderIntelStockLfConcentration(
  data: IntelStockLfConcentration[],
  helpers: { t: (k: string) => string; formatPct: (n: number) => string }
) {
  const { t, formatPct } = helpers;
  const container = document.getElementById('intelChartStockLFByStock');
  if (!container) return;
  container.innerHTML = '';

  const colPitch = 50;
  const barW = 15;
  const barGap = 5;
  const pairW = barW * 2 + barGap;
  const margin = { top: 10, right: 16, bottom: 44, left: 36 };
  const innerH = 200;
  const innerW = data.length * colPitch;
  const w = margin.left + innerW + margin.right;
  const h = margin.top + innerH + margin.bottom;

  const maxPerStock = d3.max(data, (d) => Math.max(d.localSum, d.foreignSum)) ?? 0;
  const yMax = maxPerStock > 0 ? maxPerStock * 1.08 : 1;
  const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]);

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', w)
    .attr('height', h)
    .attr('role', 'img')
    .attr('aria-label', t('lf_concentration_by_stock'));

  const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const yGrid = d3
    .axisLeft(y)
    .ticks(4)
    .tickSize(-innerW)
    .tickFormat((v) => formatPct(Number(v)));
  chart
    .append('g')
    .attr('class', 'intel-stock-lf-ygrid')
    .call(yGrid)
    .call((g) => g.select('.domain').remove())
    .selectAll('.tick line')
    .attr('stroke', 'var(--border)')
    .attr('stroke-opacity', 0.45);
  chart.selectAll('.intel-stock-lf-ygrid .tick text').attr('opacity', 0);

  data.forEach((d, i) => {
    const cx = i * colPitch + colPitch / 2;
    const xLocal = cx - pairW / 2;
    const xForeign = xLocal + barW + barGap;

    const yL = y(Math.max(0, d.localSum));
    const yF = y(Math.max(0, d.foreignSum));
    const hL = Math.max(0, innerH - yL);
    const hF = Math.max(0, innerH - yF);

    const tipLocal = `${d.code} — ${t('local')}: ${formatPct(d.localSum)}`;
    const tipForeign = `${d.code} — ${t('foreign')}: ${formatPct(d.foreignSum)}`;
    const tipIssuer = d.issuer ? `${d.issuer}\n` : '';

    const rL = chart
      .append('rect')
      .attr('x', xLocal)
      .attr('y', yL)
      .attr('width', barW)
      .attr('height', hL)
      .attr('fill', STOCK_LF_LOCAL)
      .attr('rx', 3);
    rL.append('title').text(`${tipIssuer}${tipLocal}`);

    const rF = chart
      .append('rect')
      .attr('x', xForeign)
      .attr('y', yF)
      .attr('width', barW)
      .attr('height', hF)
      .attr('fill', STOCK_LF_FOREIGN)
      .attr('rx', 3);
    rF.append('title').text(`${tipIssuer}${tipForeign}`);

    chart
      .append('text')
      .attr('x', cx)
      .attr('y', innerH + 18)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-dim)')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('font-family', 'Inter, sans-serif')
      .text(d.code);
  });

  const yLabels = d3.axisLeft(y).ticks(4).tickSize(0).tickFormat((v) => formatPct(Number(v)));
  chart
    .append('g')
    .attr('class', 'intel-stock-lf-yaxis')
    .call(yLabels)
    .call((g) => g.select('.domain').remove());
  chart
    .selectAll('.intel-stock-lf-yaxis .tick text')
    .attr('fill', 'var(--text-muted)')
    .attr('font-size', 10);
}

function renderIntelTypeDonut(
  intelProfiles: IntelProfile[],
  typeLabel: (code: string) => string
) {
  const container = document.getElementById('intelChartType');
  if (!container) return;
  container.innerHTML = '';
  const counts: Record<string, number> = {};
  intelProfiles.forEach((p) => {
    const k = p.type_code || '';
    counts[k] = (counts[k] || 0) + 1;
  });
  const data = Object.entries(counts)
    .filter(([k]) => k !== '')
    .map(([k, v]) => ({ key: k, value: v, label: typeLabel(k) || k }))
    .sort((a, b) => b.value - a.value);

  const w = 320;
  const h = 240;
  const r = (Math.min(w * 0.45, h) / 2 - 8);
  const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${w} ${h}`);
  const g = svg.append('g').attr('transform', `translate(${r + 16},${h / 2})`);

  const pie = d3.pie<(typeof data)[0]>().value((d) => d.value).sort(null);
  const arc = d3.arc<d3.PieArcDatum<(typeof data)[0]>>().innerRadius(r * 0.52).outerRadius(r);

  g.selectAll('path')
    .data(pie(data))
    .join('path')
    .attr('d', arc)
    .attr('fill', (d) => TYPE_COLORS[d.data.key] || '#555')
    .attr('stroke', 'var(--bg)')
    .attr('stroke-width', 2);

  const fmtEN = new Intl.NumberFormat('en-US');
  const legend = svg.append('g').attr('transform', `translate(${r * 2 + 44}, ${(h - data.length * 22) / 2})`);
  data.forEach((d, i) => {
    const row = legend.append('g').attr('transform', `translate(0, ${i * 22})`);
    row.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', TYPE_COLORS[d.key] || '#555');
    row
      .append('text')
      .attr('x', 16)
      .attr('y', 9)
      .attr('fill', 'var(--text-dim)')
      .attr('font-size', 11)
      .attr('font-family', 'Inter, sans-serif')
      .text(`${d.label} (${fmtEN.format(d.value)})`);
  });
}

function renderIntelLFBar(intelProfiles: IntelProfile[], t: (k: string) => string) {
  const container = document.getElementById('intelChartLF');
  if (!container) return;
  container.innerHTML = '';
  const local = intelProfiles.filter((p) => p.local_foreign === 'L').length;
  const foreign = intelProfiles.filter((p) => p.local_foreign === 'F').length;
  const unknown = intelProfiles.length - local - foreign;
  const data: { label: string; value: number; color: string }[] = [
    { label: t('local'), value: local, color: '#5db8d9' },
    { label: t('foreign'), value: foreign, color: '#c0c0c0' },
  ];
  if (unknown > 0) data.push({ label: t('unclassified'), value: unknown, color: '#5e5a56' });

  const fmtEN = new Intl.NumberFormat('en-US');
  const w = 320;
  const h = 240;
  const margin = { top: 24, right: 60, bottom: 24, left: 80 };
  const iw = w - margin.left - margin.right;
  const ih = h - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${w} ${h}`);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const y = d3
    .scaleBand()
    .domain(data.map((d) => d.label))
    .range([0, ih])
    .padding(0.35);
  const x = d3
    .scaleLinear()
    .domain([0, (d3.max(data, (d) => d.value) ?? 0) * 1.15])
    .range([0, iw]);

  g.selectAll('rect')
    .data(data)
    .join('rect')
    .attr('x', 0)
    .attr('y', (d) => y(d.label) ?? 0)
    .attr('width', (d) => x(d.value))
    .attr('height', y.bandwidth())
    .attr('fill', (d) => d.color)
    .attr('rx', 5);

  g.selectAll('.bar-label')
    .data(data)
    .join('text')
    .attr('class', 'bar-label')
    .attr('x', (d) => x(d.value) + 8)
    .attr('y', (d) => (y(d.label) ?? 0) + y.bandwidth() / 2)
    .attr('dy', '0.35em')
    .attr('fill', '#e0ddd8')
    .attr('font-size', 13)
    .attr('font-weight', 700)
    .attr('font-family', 'Inter, sans-serif')
    .text((d) => fmtEN.format(d.value));

  g.append('g')
    .call(d3.axisLeft(y).tickSize(0))
    .select('.domain')
    .remove();
  g.selectAll('.tick text')
    .attr('fill', '#9a9590')
    .attr('font-size', 13)
    .attr('font-weight', 600)
    .attr('font-family', 'Inter, sans-serif');
}

function renderIntelNatBar(intelProfiles: IntelProfile[]) {
  const container = document.getElementById('intelChartNat');
  if (!container) return;
  container.innerHTML = '';
  const counts: Record<string, number> = {};
  intelProfiles.forEach((p) => {
    if (p.nationality) counts[p.nationality] = (counts[p.nationality] || 0) + 1;
  });
  const data = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => ({ label: k, value: v }));

  const w = 320;
  const h = 240;
  const margin = { top: 12, right: 50, bottom: 12, left: 100 };
  const iw = w - margin.left - margin.right;
  const ih = h - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${w} ${h}`);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const y = d3
    .scaleBand()
    .domain(data.map((d) => d.label))
    .range([0, ih])
    .padding(0.25);
  const x = d3
    .scaleLinear()
    .domain([0, (d3.max(data, (d) => d.value) ?? 0) * 1.15])
    .range([0, iw]);

  g.selectAll('rect')
    .data(data)
    .join('rect')
    .attr('x', 0)
    .attr('y', (d) => y(d.label) ?? 0)
    .attr('width', (d) => x(d.value))
    .attr('height', y.bandwidth())
    .attr('fill', '#4d9cb9')
    .attr('opacity', (_d, i) => 1 - i * 0.08)
    .attr('rx', 3);

  g.selectAll('.bar-label')
    .data(data)
    .join('text')
    .attr('class', 'bar-label')
    .attr('x', (d) => x(d.value) + 6)
    .attr('y', (d) => (y(d.label) ?? 0) + y.bandwidth() / 2)
    .attr('dy', '0.35em')
    .attr('fill', '#e0ddd8')
    .attr('font-size', 11)
    .attr('font-weight', 700)
    .attr('font-family', 'Inter, sans-serif')
    .text((d) => d.value);

  g.append('g')
    .call(d3.axisLeft(y).tickSize(0))
    .select('.domain')
    .remove();
  g.selectAll('.tick text')
    .attr('fill', '#9a9590')
    .attr('font-size', 10)
    .attr('font-weight', 500)
    .attr('font-family', 'Inter, sans-serif');
}
