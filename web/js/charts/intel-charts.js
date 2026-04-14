/**
 * Intelligence D3 charts — dynamically imported when Intelligence first loads.
 * Expects global `d3` (from index.html script tag).
 */
/* global d3 */

/**
 * @param {object[]} intelProfiles
 * @param {{ t: (k: string) => string, TYPE_LABELS_MAP: () => Record<string,string>, TYPE_COLORS: Record<string,string> }} helpers
 */
export function renderIntelCharts(intelProfiles, helpers) {
  const { t, TYPE_LABELS_MAP, TYPE_COLORS } = helpers;
  renderIntelTypeDonut(intelProfiles, TYPE_LABELS_MAP, TYPE_COLORS);
  renderIntelLFBar(intelProfiles, t);
  renderIntelNatBar(intelProfiles);
}

function renderIntelTypeDonut(intelProfiles, TYPE_LABELS_MAP, TYPE_COLORS) {
  const container = document.getElementById('intelChartType');
  container.innerHTML = '';
  const counts = {};
  intelProfiles.forEach(p => { counts[p.type_code || ''] = (counts[p.type_code || ''] || 0) + 1; });
  const data = Object.entries(counts)
    .filter(([k]) => k !== '')
    .map(([k, v]) => ({ key: k, value: v, label: TYPE_LABELS_MAP()[k] || k }))
    .sort((a, b) => b.value - a.value);

  const w = 320, h = 240, r = Math.min(w * 0.45, h) / 2 - 8;
  const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${w} ${h}`);
  const g = svg.append('g').attr('transform', `translate(${r + 16},${h/2})`);

  const pie = d3.pie().value(d => d.value).sort(null);
  const arc = d3.arc().innerRadius(r * 0.52).outerRadius(r);

  g.selectAll('path').data(pie(data)).join('path')
    .attr('d', arc)
    .attr('fill', d => TYPE_COLORS[d.data.key] || '#555')
    .attr('stroke', 'var(--bg)').attr('stroke-width', 2);

  const fmtEN = new Intl.NumberFormat('en-US');
  const legend = svg.append('g').attr('transform', `translate(${r * 2 + 44}, ${(h - data.length * 22) / 2})`);
  data.forEach((d, i) => {
    const row = legend.append('g').attr('transform', `translate(0, ${i * 22})`);
    row.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', TYPE_COLORS[d.key] || '#555');
    row.append('text').attr('x', 16).attr('y', 9).attr('fill', 'var(--text-dim)').attr('font-size', 11).attr('font-family', 'Inter, sans-serif')
      .text(`${d.label} (${fmtEN.format(d.value)})`);
  });
}

function renderIntelLFBar(intelProfiles, t) {
  const container = document.getElementById('intelChartLF');
  container.innerHTML = '';
  const local = intelProfiles.filter(p => p.local_foreign === 'L').length;
  const foreign = intelProfiles.filter(p => p.local_foreign === 'F').length;
  const unknown = intelProfiles.length - local - foreign;
  const data = [
    { label: t('local'), value: local, color: '#5db8d9' },
    { label: t('foreign'), value: foreign, color: '#c0c0c0' },
  ];
  if (unknown > 0) data.push({ label: 'Unclassified', value: unknown, color: '#5e5a56' });

  const fmtEN = new Intl.NumberFormat('en-US');
  const w = 320, h = 240, margin = { top: 24, right: 60, bottom: 24, left: 80 };
  const iw = w - margin.left - margin.right, ih = h - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${w} ${h}`);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const y = d3.scaleBand().domain(data.map(d => d.label)).range([0, ih]).padding(0.35);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.value) * 1.15]).range([0, iw]);

  g.selectAll('rect').data(data).join('rect')
    .attr('x', 0).attr('y', d => y(d.label)).attr('width', d => x(d.value)).attr('height', y.bandwidth())
    .attr('fill', d => d.color).attr('rx', 5);

  g.selectAll('.bar-label').data(data).join('text')
    .attr('x', d => x(d.value) + 8).attr('y', d => y(d.label) + y.bandwidth() / 2)
    .attr('dy', '0.35em').attr('fill', '#e0ddd8').attr('font-size', 13).attr('font-weight', 700).attr('font-family', 'Inter, sans-serif')
    .text(d => fmtEN.format(d.value));

  g.append('g').call(d3.axisLeft(y).tickSize(0)).select('.domain').remove();
  g.selectAll('.tick text').attr('fill', '#9a9590').attr('font-size', 13).attr('font-weight', 600).attr('font-family', 'Inter, sans-serif');
}

function renderIntelNatBar(intelProfiles) {
  const container = document.getElementById('intelChartNat');
  container.innerHTML = '';
  const counts = {};
  intelProfiles.forEach(p => { if (p.nationality) counts[p.nationality] = (counts[p.nationality] || 0) + 1; });
  const data = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v }));

  const w = 320, h = 240, margin = { top: 12, right: 50, bottom: 12, left: 100 };
  const iw = w - margin.left - margin.right, ih = h - margin.top - margin.bottom;

  const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${w} ${h}`);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const y = d3.scaleBand().domain(data.map(d => d.label)).range([0, ih]).padding(0.25);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.value) * 1.15]).range([0, iw]);

  g.selectAll('rect').data(data).join('rect')
    .attr('x', 0).attr('y', d => y(d.label)).attr('width', d => x(d.value)).attr('height', y.bandwidth())
    .attr('fill', '#4d9cb9').attr('opacity', (d, i) => 1 - i * 0.08).attr('rx', 3);

  g.selectAll('.bar-label').data(data).join('text')
    .attr('x', d => x(d.value) + 6).attr('y', d => y(d.label) + y.bandwidth() / 2)
    .attr('dy', '0.35em').attr('fill', '#e0ddd8').attr('font-size', 11).attr('font-weight', 700).attr('font-family', 'Inter, sans-serif')
    .text(d => d.value);

  g.append('g').call(d3.axisLeft(y).tickSize(0)).select('.domain').remove();
  g.selectAll('.tick text').attr('fill', '#9a9590').attr('font-size', 10).attr('font-weight', 500).attr('font-family', 'Inter, sans-serif');
}
