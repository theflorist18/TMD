import * as d3 from 'd3';
import type { HolderRow } from '@/domain/holders';
import { formatInt, formatPct, esc } from '@/lib/format';

function tt(
  el: HTMLElement | null,
  html: string,
  show: boolean,
  cx?: number,
  cy?: number
) {
  if (!el) return;
  if (!show) {
    el.classList.remove('show');
    return;
  }
  if (html !== '') {
    el.innerHTML = html;
  }
  el.classList.add('show');
  if (cx != null) el.style.left = `${cx + 14}px`;
  if (cy != null) el.style.top = `${cy - 10}px`;
}

function portfolioSharePct(value: number, totalShares: number): string {
  if (!(totalShares > 0)) return '0';
  return ((value / totalShares) * 100).toFixed(1);
}

/** Investor portfolio allocation by stock (shares). */
export function renderInvestorPie(
  container: HTMLElement,
  rows: HolderRow[],
  opts: { t: (k: string) => string; onStockClick: (code: string) => void }
) {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'pie-with-legend';
  const svgHost = document.createElement('div');
  svgHost.className = 'pie-svg-wrap';
  const legendEl = document.createElement('div');
  legendEl.className = 'pie-legend';
  root.appendChild(svgHost);
  root.appendChild(legendEl);
  container.appendChild(root);

  const size = 260;
  const radius = size / 2;
  const inner = radius * 0.55;
  const svg = d3
    .select(svgHost)
    .append('svg')
    .attr('viewBox', `0 0 ${size} ${size}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .append('g')
    .attr('transform', `translate(${radius},${radius})`);

  const totalShares = rows.reduce((s, r) => s + r.total_holding_shares, 0);
  const pieData = rows
    .map((r) => ({
      code: r.share_code,
      value: r.total_holding_shares,
      pct: r.percentage,
      type: r.investor_type,
    }))
    .sort((a, b) => b.value - a.value);

  const pie = d3.pie<(typeof pieData)[0]>().value((d) => d.value).sort(null).padAngle(0.02);
  const arc = d3.arc<d3.PieArcDatum<(typeof pieData)[0]>>().innerRadius(inner).outerRadius(radius - 4);
  const arcHover = d3
    .arc<d3.PieArcDatum<(typeof pieData)[0]>>()
    .innerRadius(inner)
    .outerRadius(radius);

  const color = d3
    .scaleOrdinal<string>()
    .domain(pieData.map((d) => d.code))
    .range(d3.quantize((t) => d3.interpolateRainbow(t * 0.8 + 0.1), Math.max(pieData.length, 2)));

  const title = document.createElement('div');
  title.className = 'pie-legend-title';
  title.textContent = opts.t('pie_legend_title');
  legendEl.appendChild(title);
  const ul = document.createElement('ul');
  ul.className = 'pie-legend-list';
  pieData.forEach((d) => {
    const li = document.createElement('li');
    li.className = 'pie-legend-row';
    li.style.cursor = 'pointer';
    const sw = document.createElement('span');
    sw.className = 'pie-legend-swatch';
    sw.style.background = color(d.code);
    const lab = document.createElement('span');
    lab.className = 'pie-legend-label';
    lab.textContent = d.code;
    const pc = document.createElement('span');
    pc.className = 'pie-legend-pct';
    pc.textContent = `${portfolioSharePct(d.value, totalShares)}%`;
    li.append(sw, lab, pc);
    li.addEventListener('click', () => opts.onStockClick(d.code));
    ul.appendChild(li);
  });
  legendEl.appendChild(ul);

  const tooltip = document.getElementById('tooltip');

  svg
    .selectAll('path')
    .data(pie(pieData))
    .join('path')
    .attr('d', arc)
    .attr('fill', (d) => color(d.data.code))
    .attr('stroke', 'var(--surface)')
    .attr('stroke-width', 1)
    .on('mouseover', function (e, d) {
      d3.select(this).transition().duration(150).attr('d', arcHover);
      const sharePct = portfolioSharePct(d.data.value, totalShares);
      tt(
        tooltip,
        `<div class="tt-ticker">${esc(d.data.code)}</div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_total_shares')}</span><span class="tt-val">${formatInt(d.data.value)}</span></div>
        <div class="tt-row"><span class="tt-label">${opts.t('pie_tt_portfolio_share')}</span><span class="tt-val">${sharePct}%</span></div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_stake_pct')}</span><span class="tt-val">${formatPct(d.data.pct)}</span></div>`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => tt(tooltip, '', true, e.clientX, e.clientY))
    .on('mouseout', function () {
      d3.select(this).transition().duration(150).attr('d', arc);
      tt(tooltip, '', false);
    })
    .attr('cursor', 'pointer')
    .on('click', (_e, d) => opts.onStockClick(d.data.code));

  if (pieData.length <= 8) {
    svg
      .selectAll('text.pie-label')
      .data(pie(pieData))
      .join('text')
      .attr('class', 'pie-label')
      .attr('transform', (d) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '9px')
      .attr('font-weight', '600')
      .each(function (d) {
        const g = d3.select(this);
        const p = portfolioSharePct(d.data.value, totalShares);
        g.append('tspan')
          .attr('x', 0)
          .attr('dy', '-0.15em')
          .text(d.data.code);
        g.append('tspan')
          .attr('x', 0)
          .attr('dy', '1.05em')
          .attr('font-size', '8px')
          .attr('opacity', 0.95)
          .text(`${p}%`);
      });
  }

  svg
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '-0.2em')
    .attr('fill', 'var(--text)')
    .attr('font-size', '18px')
    .attr('font-weight', '700')
    .text(String(pieData.length));
  svg
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '1.2em')
    .attr('fill', 'var(--text-dim)')
    .attr('font-size', '11px')
    .text(opts.t('pie_stocks'));
}

/** Stock ownership breakdown by investor (shares). */
export function renderStockPie(
  container: HTMLElement,
  rows: HolderRow[],
  opts: { t: (k: string) => string; onInvestorClick: (name: string) => void }
) {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'pie-with-legend';
  const svgHost = document.createElement('div');
  svgHost.className = 'pie-svg-wrap';
  const legendEl = document.createElement('div');
  legendEl.className = 'pie-legend';
  root.appendChild(svgHost);
  root.appendChild(legendEl);
  container.appendChild(root);

  const size = 260;
  const radius = size / 2;
  const inner = radius * 0.55;
  const svg = d3
    .select(svgHost)
    .append('svg')
    .attr('viewBox', `0 0 ${size} ${size}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .append('g')
    .attr('transform', `translate(${radius},${radius})`);

  const totalShares = rows.reduce((s, r) => s + r.total_holding_shares, 0);
  const pieData = rows
    .map((r) => ({
      name: r.investor_name,
      value: r.total_holding_shares,
      pct: r.percentage,
      type: r.investor_type,
    }))
    .sort((a, b) => b.value - a.value);

  const pie = d3.pie<(typeof pieData)[0]>().value((d) => d.value).sort(null).padAngle(0.02);
  const arc = d3.arc<d3.PieArcDatum<(typeof pieData)[0]>>().innerRadius(inner).outerRadius(radius - 4);
  const arcHover = d3
    .arc<d3.PieArcDatum<(typeof pieData)[0]>>()
    .innerRadius(inner)
    .outerRadius(radius);

  const color = d3
    .scaleOrdinal<string>()
    .domain(pieData.map((d) => d.name))
    .range(d3.quantize((t) => d3.interpolateRainbow(t * 0.8 + 0.1), Math.max(pieData.length, 2)));

  const title = document.createElement('div');
  title.className = 'pie-legend-title';
  title.textContent = opts.t('pie_legend_title');
  legendEl.appendChild(title);
  const ul = document.createElement('ul');
  ul.className = 'pie-legend-list';
  pieData.forEach((d) => {
    const li = document.createElement('li');
    li.className = 'pie-legend-row';
    li.style.cursor = 'pointer';
    const sw = document.createElement('span');
    sw.className = 'pie-legend-swatch';
    sw.style.background = color(d.name);
    const lab = document.createElement('span');
    lab.className = 'pie-legend-label';
    lab.textContent = d.name.length > 22 ? `${d.name.slice(0, 20)}…` : d.name;
    lab.title = d.name;
    const pc = document.createElement('span');
    pc.className = 'pie-legend-pct';
    pc.textContent = `${portfolioSharePct(d.value, totalShares)}%`;
    li.append(sw, lab, pc);
    li.addEventListener('click', () => opts.onInvestorClick(d.name));
    ul.appendChild(li);
  });
  legendEl.appendChild(ul);

  const tooltip = document.getElementById('tooltip');

  svg
    .selectAll('path')
    .data(pie(pieData))
    .join('path')
    .attr('d', arc)
    .attr('fill', (d) => color(d.data.name))
    .attr('stroke', 'var(--surface)')
    .attr('stroke-width', 1)
    .on('mouseover', function (e, d) {
      d3.select(this).transition().duration(150).attr('d', arcHover);
      const sharePct = portfolioSharePct(d.data.value, totalShares);
      tt(
        tooltip,
        `<div class="tt-ticker">${esc(d.data.name)}</div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_total_shares')}</span><span class="tt-val">${formatInt(d.data.value)}</span></div>
        <div class="tt-row"><span class="tt-label">${opts.t('pie_tt_holder_share')}</span><span class="tt-val">${sharePct}%</span></div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_stake_pct')}</span><span class="tt-val">${formatPct(d.data.pct)}</span></div>`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => tt(tooltip, '', true, e.clientX, e.clientY))
    .on('mouseout', function () {
      d3.select(this).transition().duration(150).attr('d', arc);
      tt(tooltip, '', false);
    })
    .attr('cursor', 'pointer')
    .on('click', (_e, d) => opts.onInvestorClick(d.data.name));

  if (pieData.length <= 8) {
    svg
      .selectAll('text.pie-label')
      .data(pie(pieData))
      .join('text')
      .attr('class', 'pie-label')
      .attr('transform', (d) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', '8px')
      .attr('font-weight', '600')
      .each(function (d) {
        const g = d3.select(this);
        const p = portfolioSharePct(d.data.value, totalShares);
        const short = d.data.name.length > 6 ? d.data.name.slice(0, 5) + '…' : d.data.name;
        g.append('tspan')
          .attr('x', 0)
          .attr('dy', '-0.15em')
          .text(short);
        g.append('tspan')
          .attr('x', 0)
          .attr('dy', '1em')
          .attr('font-size', '7px')
          .text(`${p}%`);
      });
  }

  svg
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '-0.2em')
    .attr('fill', 'var(--text)')
    .attr('font-size', '18px')
    .attr('font-weight', '700')
    .text(String(pieData.length));
  svg
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '1.2em')
    .attr('fill', 'var(--text-dim)')
    .attr('font-size', '11px')
    .text(opts.t('pie_holders'));
}

/** Aggregate group holdings by ticker (sum shares) and reuse investor pie + legend. */
export function renderGroupPie(
  container: HTMLElement,
  rows: HolderRow[],
  opts: { t: (k: string) => string; onStockClick: (code: string) => void }
) {
  const byCode = new Map<
    string,
    { shares: number; issuer: string; invType: string; maxPct: number; date: string }
  >();
  rows.forEach((r) => {
    const cur = byCode.get(r.share_code);
    if (!cur) {
      byCode.set(r.share_code, {
        shares: r.total_holding_shares,
        issuer: r.issuer_name,
        invType: r.investor_type,
        maxPct: r.percentage,
        date: r.date,
      });
    } else {
      cur.shares += r.total_holding_shares;
      cur.maxPct = Math.max(cur.maxPct, r.percentage);
      if (!cur.issuer && r.issuer_name) cur.issuer = r.issuer_name;
    }
  });
  const synthetic: HolderRow[] = [...byCode.entries()].map(([code, v]) => ({
    date: v.date,
    share_code: code,
    issuer_name: v.issuer,
    investor_name: '',
    investor_type: v.invType,
    local_foreign: '',
    nationality: '',
    domicile: '',
    holdings_scripless: 0,
    holdings_scrip: 0,
    total_holding_shares: v.shares,
    percentage: v.maxPct,
  }));
  renderInvestorPie(container, synthetic, opts);
}
