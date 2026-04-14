import { I18N } from './i18n-data.js';

let currentLang = localStorage.getItem('tmd_lang') || 'en';

function t(key) { return (I18N[currentLang] || I18N.en)[key] || I18N.en[key] || key; }
function tt(key) { return (I18N[currentLang] || I18N.en)[key] || I18N.en[key] || ''; }

/* ── Constants ─────────────────────────────────────────────── */

/** Repo `output/` folder (sibling of `web/`). Resolves correctly for web/, web/dist/, Vite dev/preview, and file://. */
const OUTPUT_BASE = new URL('../../output/', window.location.href).href;

const TYPE_COLORS = {
  CP: '#c0c0c0', ID: '#5db8d9', IS: '#f59e0b', IB: '#e8e8e8',
  SC: '#67e8f9', MF: '#f97316', OT: '#a78bfa', PF: '#f472b6',
  FD: '#888', '': '#444'
};

function TYPE_LABELS_MAP() { return t('type_labels'); }
function RISK_FLAG_LABELS_MAP() { return t('risk_labels'); }
function CLASSIFICATION_TIPS_MAP() { return t('class_tips'); }
function TYPE_TIPS_MAP() { return t('type_tips'); }
function CONFIDENCE_TIPS_MAP() { return t('confidence_tips'); }
function METHOD_TIPS_MAP() { return t('method_tips'); }
function RISK_FLAG_TIPS_MAP() { return t('risk_tips'); }
function CLASS_LABELS_MAP() { return t('class_labels'); }

const TYPE_LABELS = I18N.en.type_labels;
const fmt = new Intl.NumberFormat('en-US');
const fmtPct = v => v.toFixed(2) + '%';

/** Darken very light type fills for force-graph nodes only (legends/pie keep TYPE_COLORS). */
function graphNodeFillForType(tp) {
  const base = TYPE_COLORS[tp] || TYPE_COLORS[''];
  const c = d3.color(base);
  if (!c) return base;
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  if (lum > 0.5) return c.darker(0.75 + (lum - 0.5) * 1.5).formatHex();
  return base;
}

/** Subtle ring on light fills so white labels stay readable. */
function graphNodeStrokeForFill(fillHex) {
  const c = d3.color(fillHex);
  if (!c) return null;
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  return lum > 0.48 ? 'rgba(0,0,0,0.42)' : null;
}

const GRAPH_LINK_STROKE = 'rgba(93, 184, 217, 0.55)';

function debounce(fn, ms = 200) {
  let id;
  return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
}

const RISK_FLAG_LABELS = I18N.en.risk_labels;
const RISK_FLAG_TIPS = I18N.en.risk_tips;
const CLASSIFICATION_TIPS = I18N.en.class_tips;
const TYPE_TIPS = I18N.en.type_tips;
const CONFIDENCE_TIPS = I18N.en.confidence_tips;
const METHOD_TIPS = I18N.en.method_tips;

/* ── State ─────────────────────────────────────────────────── */

let allData = [];
let investorMap = new Map();
let investorNames = [];
let stockMap = new Map();
let stockNames = [];
let nationalityList = [];
let domicileList = [];
let searchMode = 'investor';
let currentPage = 'home';
let filtersInitialized = false;
let marketInitialized = false;
let logoMap = new Map();
let intelInitialized = false;
let intelProfiles = [];
let intelGroups = [];
let intelProfileMap = new Map();

/* ── i18n Apply ────────────────────────────────────────────── */

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (!val || val === key) return;
    const svg = el.querySelector('svg');
    if (svg) {
      Array.from(el.childNodes).forEach(n => { if (n.nodeType === 3) n.remove(); });
      el.appendChild(document.createTextNode(' ' + val));
    } else {
      el.textContent = val;
    }
  });

  document.getElementById('dateBadge').textContent = t('data_as_of') + ' 2026-03-31';

  const searchEl = document.getElementById('search');
  if (searchEl) {
    const placeholders = { investor: t('search_investor'), stock: t('search_stock'), nationality: t('search_nationality'), domicile: t('search_domicile') };
    searchEl.placeholder = placeholders[searchMode] || t('search_investor');
  }

  const intelSearch = document.getElementById('intelSearch');
  if (intelSearch) intelSearch.placeholder = t('search_intel');
  const groupSearch = document.getElementById('intelGroupSearch');
  if (groupSearch) groupSearch.placeholder = t('search_groups');

  const grpTitle = document.getElementById('intelGroupsTitle');
  if (grpTitle) grpTitle.setAttribute('data-tip', tt('tip_detected_groups'));

  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === currentLang));
}

function setLang(lang) {
  if (lang === currentLang) return;
  currentLang = lang;
  localStorage.setItem('tmd_lang', lang);
  applyI18n();

  if (allData.length) renderHomePage();

  if (currentPage === 'holdings' && filtersInitialized) {
    renderAllHead();
    renderAllPage();
  }

  if (intelInitialized) {
    renderIntelStats();
    renderIntelClassTabs();
    renderIntelDirHead();
    renderIntelDirBody();
    renderIntelGroupCards();
  }

  const dashboard = document.getElementById('dashboard');
  if (dashboard && dashboard.style.display !== 'none') {
    const name = document.getElementById('investorName').textContent;
    const rows = investorMap.get(name);
    if (rows) {
      renderStats(rows);
      renderInvestorTableHead();
      renderInvestorTableBody(rows);
    }
  }

  const stockDetail = document.getElementById('stockDetail');
  if (stockDetail && stockDetail.style.display !== 'none') {
    renderStockDetailHead();
    renderStockDetailBody();
  }
}

/* ── Routing ───────────────────────────────────────────────── */

function navigate(page) {
  if (!['home', 'explorer', 'holdings', 'market', 'intelligence'].includes(page)) page = 'home';
  currentPage = page;

  document.querySelectorAll('.page-section').forEach(s => {
    s.classList.remove('page-active');
  });

  const target = document.getElementById('page-' + page);
  if (target) {
    target.classList.add('page-active');
    void target.offsetWidth;
  }

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
    if (l.dataset.page === page) l.setAttribute('aria-current', 'page');
    else l.removeAttribute('aria-current');
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
  location.hash = page;

  if (page === 'holdings' && allData.length && !filtersInitialized) {
    initHoldingsPage();
  }

  if (page === 'market' && !marketInitialized) {
    initMarketPage();
  }

  if (page === 'intelligence' && !intelInitialized) {
    initIntelligencePage();
  }
}

function handleHash() {
  const hash = location.hash.replace('#', '') || 'home';
  navigate(hash);
}

window.addEventListener('hashchange', handleHash);

/* ── Init ──────────────────────────────────────────────────── */

async function init() {
  let resp, text;
  try {
    resp = await fetch(new URL('one_percent_holders.csv', OUTPUT_BASE));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    text = await resp.text();
  } catch (err) {
    document.getElementById('loader').classList.add('hidden');
    document.querySelector('main').innerHTML = `
      <div class="error-banner" style="margin-top:80px">
        <h3>${t('failed_load')}</h3>
        <p>${t('failed_load_msg')}</p>
        <p style="margin-top:12px;font-size:12px;opacity:0.6">${esc(err.message)}</p>
      </div>`;
    return;
  }
  allData = d3.csvParse(text, d => ({
    date: d.date,
    share_code: d.share_code,
    issuer_name: d.issuer_name,
    investor_name: d.investor_name,
    investor_type: d.investor_type || '',
    local_foreign: d.local_foreign || '',
    nationality: d.nationality || '',
    domicile: d.domicile || '',
    holdings_scripless: +d.holdings_scripless,
    holdings_scrip: +d.holdings_scrip,
    total_holding_shares: +d.total_holding_shares,
    percentage: +d.percentage
  }));

  investorMap = d3.group(allData, d => d.investor_name);
  investorNames = Array.from(investorMap.keys()).sort();

  stockMap = new Map();
  allData.forEach(r => {
    const key = r.share_code;
    if (!stockMap.has(key)) stockMap.set(key, { code: r.share_code, issuer: r.issuer_name, rows: [] });
    stockMap.get(key).rows.push(r);
  });
  stockNames = Array.from(stockMap.keys()).sort();

  nationalityList = [...new Set(allData.map(r => r.nationality).filter(Boolean))].sort();
  domicileList = [...new Set(allData.map(r => r.domicile).filter(Boolean))].sort();

  document.getElementById('loader').classList.add('hidden');
  applyI18n();

  renderHomePage();
  setupSearch();
  handleHash();

  fetchStockLogos();
}

/* ── Stock Logo Fetching ───────────────────────────────────── */

async function fetchStockLogos() {
  try {
    const tickers = stockNames.map(c => 'IDX:' + c);
    const batchSize = 500;
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const resp = await fetch('https://scanner.tradingview.com/indonesia/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: ['logoid', 'name'],
          symbols: { tickers: batch },
          range: [0, batch.length]
        })
      });
      if (!resp.ok) throw new Error(`Scanner API ${resp.status}`);
      const json = await resp.json();
      if (json.data) {
        json.data.forEach(item => {
          const ticker = item.s.replace('IDX:', '');
          const logoid = item.d[0];
          if (logoid) logoMap.set(ticker, logoid);
        });
      }
    }
    applyLogosToPage();
  } catch (e) {
    /* logos are non-critical; fall back to letter avatars silently */
  }
}

function getLogoUrl(code) {
  const logoid = logoMap.get(code);
  return logoid ? `https://s3-symbol-logo.tradingview.com/${logoid}--big.svg` : null;
}

function applyLogosToPage() {
  document.querySelectorAll('img[data-logo-ticker]').forEach(img => {
    const code = img.dataset.logoTicker;
    const url = getLogoUrl(code);
    if (url) {
      img.src = url;
      img.style.display = '';
    }
  });
}

/* ── Home Page ─────────────────────────────────────────────── */

function renderHomePage() {
  const totalRows = allData.length;
  const uniqueInvestors = investorNames.length;
  const uniqueStocks = stockNames.length;
  const reportDate = allData.length ? allData[0].date : '—';

  const svgIcons = {
    records: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    investors: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    stocks: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    date: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
  };

  const statsHtml = [
    { icon: svgIcons.records, bg: 'rgba(77,156,185,0.12)', color: '#5db8d9', label: t('stat_total_records'), value: fmt.format(totalRows), sub: t('sub_ownership_entries'), animate: true, tip: tt('tip_stat_records') },
    { icon: svgIcons.investors, bg: 'var(--green-soft)', color: 'var(--green)', label: t('stat_unique_investors'), value: fmt.format(uniqueInvestors), sub: t('sub_distinct_shareholders'), animate: true, tip: tt('tip_stat_investors') },
    { icon: svgIcons.stocks, bg: 'var(--purple-soft)', color: 'var(--purple)', label: t('stat_unique_stocks'), value: fmt.format(uniqueStocks), sub: t('sub_listed_companies'), animate: true, tip: tt('tip_stat_stocks') },
    { icon: svgIcons.date, bg: 'var(--amber-soft)', color: 'var(--amber)', label: t('stat_report_date'), value: reportDate, sub: t('sub_idx_snapshot'), animate: false, tip: tt('tip_stat_date') }
  ].map(s => `
    <div class="home-stat-card" data-tip="${s.tip}">
      <div class="home-stat-icon" style="background:${s.bg};color:${s.color}">${s.icon}</div>
      <div class="home-stat-label">${s.label}</div>
      <div class="home-stat-value" ${s.animate ? 'data-animate="true"' : ''}>${s.value}</div>
      <div class="home-stat-sub">${s.sub}</div>
    </div>
  `).join('');

  document.getElementById('homeStats').innerHTML = statsHtml;
  animateCounters();

  const topInvestors = Array.from(investorMap.entries())
    .map(([name, rows]) => ({
      name,
      stocks: rows.length,
      totalShares: rows.reduce((s, r) => s + r.total_holding_shares, 0)
    }))
    .sort((a, b) => b.totalShares - a.totalShares)
    .slice(0, 10);

  document.getElementById('homeTopInvestors').innerHTML = topInvestors.map((inv, i) => `
    <tr tabindex="0" role="link" data-nav="investor" data-name="${esc(inv.name)}">
      <td class="mini-rank">${i + 1}</td>
      <td class="mini-name"><span class="mini-name-link">${esc(inv.name)}</span></td>
      <td class="num">${inv.stocks}</td>
      <td class="num">${fmt.format(inv.totalShares)}</td>
    </tr>
  `).join('');

  const topStocks = Array.from(stockMap.entries())
    .map(([code, s]) => ({ code, issuer: s.issuer, holders: s.rows.length }))
    .sort((a, b) => b.holders - a.holders)
    .slice(0, 10);

  document.getElementById('homeTopStocks').innerHTML = topStocks.map((stk, i) => `
    <tr tabindex="0" role="link" data-nav="stock" data-code="${esc(stk.code)}">
      <td class="mini-rank">${i + 1}</td>
      <td><img class="stock-logo-sm" data-logo-ticker="${esc(stk.code)}" src="${getLogoUrl(stk.code) || ''}" alt="" style="${getLogoUrl(stk.code) ? '' : 'display:none'}"><span class="mini-ticker">${esc(stk.code)}</span></td>
      <td class="mini-name" title="${esc(stk.issuer)}">${esc(stk.issuer)}</td>
      <td class="num">${stk.holders}</td>
    </tr>
  `).join('');

  initHomeIndexChart();

  document.querySelectorAll('.mini-table tr[tabindex]').forEach(tr => {
    tr.addEventListener('click', () => {
      if (tr.dataset.nav === 'investor' && tr.dataset.name) navigateToInvestor(tr.dataset.name);
      else if (tr.dataset.nav === 'stock' && tr.dataset.code) navigateToStock(tr.dataset.code);
    });
    tr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tr.click();
      }
    });
  });
}

function animateCounters() {
  document.querySelectorAll('.home-stat-value[data-animate="true"]').forEach(el => {
    const text = el.textContent;
    const num = parseInt(text.replace(/\D/g, ''));
    if (isNaN(num) || num === 0) return;

    const duration = 800;
    const start = performance.now();
    const formatted = text;

    el.textContent = '0';
    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(num * ease);
      el.textContent = progress >= 1 ? formatted : fmt.format(current);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

/* ── Cross-page Navigation Helpers ─────────────────────────── */

function navigateToInvestor(name) {
  navigate('explorer');
  setTimeout(() => selectInvestor(name), 50);
}

function navigateToStock(code) {
  selectStock(code);
}

/* ── Search + Autocomplete ─────────────────────────────────── */

function SEARCH_PLACEHOLDERS() {
  return { investor: t('search_investor'), stock: t('search_stock'), nationality: t('search_nationality'), domicile: t('search_domicile') };
}

function closeAutocomplete() {
  const ac = document.getElementById('autocomplete');
  const input = document.getElementById('search');
  ac.classList.remove('show');
  input.setAttribute('aria-expanded', 'false');
}

function setupSearch() {
  const input = document.getElementById('search');
  const ac = document.getElementById('autocomplete');
  let activeIdx = -1;

  document.querySelectorAll('.search-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.search-tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      searchMode = btn.dataset.mode;
      input.placeholder = SEARCH_PLACEHOLDERS()[searchMode];
      input.value = '';
      closeAutocomplete();
      document.getElementById('dashboard').classList.remove('visible');
      document.getElementById('stockDetail').style.display = 'none';
      document.getElementById('explorerEmpty').style.display = '';
      hideExplorerStockChart();
      renderBrowseTable();
    });
  });

  input.addEventListener('input', debounce(() => {
    const q = input.value.trim().toLowerCase();
    if (q.length === 0) {
      closeAutocomplete();
      clearExplorerView();
      return;
    }
    if (q.length < 2) { closeAutocomplete(); return; }

    const results = getSearchResults(q);
    if (!results.length) {
      ac.innerHTML = `<div class="no-results-msg">${t('no_results_for')||'No results for'} "${esc(q)}" ${t('in_mode')||'in'} ${t('tab_'+searchMode)||searchMode}</div>`;
      ac.classList.add('show');
      return;
    }
    activeIdx = -1;
    ac.innerHTML = results.map((item, i) =>
      `<div class="ac-item" data-idx="${i}" data-value="${esc(item.value)}" data-mode="${searchMode}" role="option">
        <span class="ac-name">${item.html}</span>
        <span class="ac-count">${item.badge}</span>
      </div>`
    ).join('');
    ac.classList.add('show');
    input.setAttribute('aria-expanded', 'true');
  }, 150));

  input.addEventListener('keydown', e => {
    const items = ac.querySelectorAll('.ac-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); updateActive(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); updateActive(items); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectResult(items[activeIdx].dataset.value, items[activeIdx].dataset.mode); }
    else if (e.key === 'Escape') { closeAutocomplete(); }
  });

  ac.addEventListener('click', e => {
    const item = e.target.closest('.ac-item');
    if (item) selectResult(item.dataset.value, item.dataset.mode);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) closeAutocomplete();
  });

  document.getElementById('investorBack').addEventListener('click', () => {
    clearExplorerView();
    document.getElementById('search').value = '';
    document.getElementById('search').focus();
  });

  document.getElementById('stockBack').addEventListener('click', () => {
    clearExplorerView();
    document.getElementById('search').value = '';
    document.getElementById('search').focus();
  });

  function updateActive(items) {
    items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
  }

  renderBrowseTable();
}

function clearExplorerView() {
  document.getElementById('dashboard').classList.remove('visible');
  document.getElementById('stockDetail').style.display = 'none';
  document.getElementById('explorerEmpty').style.display = '';
  hideExplorerStockChart();
  renderBrowseTable();
}

/* ── Browse Table (Explorer landing) ──────────────────────── */

let browsePage = 1;
const browsePageSize = 15;
let browseSort = { key: null, asc: true };
let browseData = [];

function renderBrowseTable() {
  const mode = searchMode;
  browsePage = 1;
  browseSort = { key: null, asc: true };

  const titles = { investor: t('browse_investors'), stock: t('browse_stocks'), nationality: t('browse_nationalities'), domicile: t('browse_domiciles') };
  document.getElementById('browseTitle').textContent = titles[mode] || t('nav_explorer');

  if (mode === 'investor') {
    browseData = Array.from(investorMap.entries()).map(([name, rows]) => ({
      name,
      stocks: rows.length,
      totalShares: rows.reduce((s, r) => s + r.total_holding_shares, 0),
      type: [...new Set(rows.map(r => r.investor_type).filter(Boolean))].join(', '),
      localForeign: [...new Set(rows.map(r => r.local_foreign).filter(Boolean))].map(v => v === 'L' ? 'Local' : 'Foreign').join(', ')
    }));
    browseSort = { key: 'totalShares', asc: false };
    renderBrowseHead([
      { key: 'name', label: t('col_investor_name') },
      { key: 'type', label: t('col_type') },
      { key: 'localForeign', label: t('filter_lf') },
      { key: 'stocks', label: t('col_stocks') },
      { key: 'totalShares', label: t('col_total_shares'), numeric: true }
    ]);
  } else if (mode === 'stock') {
    browseData = Array.from(stockMap.entries()).map(([code, s]) => ({
      code,
      issuer: s.issuer,
      holders: s.rows.length,
      totalShares: s.rows.reduce((sum, r) => sum + r.total_holding_shares, 0),
      topHolder: s.rows.reduce((a, b) => a.percentage > b.percentage ? a : b).investor_name
    }));
    browseSort = { key: 'holders', asc: false };
    renderBrowseHead([
      { key: 'code', label: t('col_ticker') },
      { key: 'issuer', label: t('col_issuer_name') },
      { key: 'holders', label: t('stat_major_holders'), numeric: true },
      { key: 'totalShares', label: t('col_total_shares'), numeric: true },
      { key: 'topHolder', label: t('stat_largest_holder') }
    ]);
  } else if (mode === 'nationality') {
    const natMap = new Map();
    allData.forEach(r => {
      const n = r.nationality || '—';
      if (!natMap.has(n)) natMap.set(n, { name: n, rows: 0, investors: new Set(), stocks: new Set() });
      const e = natMap.get(n);
      e.rows++;
      e.investors.add(r.investor_name);
      e.stocks.add(r.share_code);
    });
    browseData = Array.from(natMap.values()).map(e => ({
      name: e.name, rows: e.rows, investors: e.investors.size, stocks: e.stocks.size
    }));
    browseSort = { key: 'rows', asc: false };
    renderBrowseHead([
      { key: 'name', label: t('tab_nationality') },
      { key: 'investors', label: t('investors') },
      { key: 'stocks', label: t('col_stocks') },
      { key: 'rows', label: t('rows') , numeric: true }
    ]);
  } else if (mode === 'domicile') {
    const domMap = new Map();
    allData.forEach(r => {
      const n = r.domicile || '—';
      if (!domMap.has(n)) domMap.set(n, { name: n, rows: 0, investors: new Set(), stocks: new Set() });
      const e = domMap.get(n);
      e.rows++;
      e.investors.add(r.investor_name);
      e.stocks.add(r.share_code);
    });
    browseData = Array.from(domMap.values()).map(e => ({
      name: e.name, rows: e.rows, investors: e.investors.size, stocks: e.stocks.size
    }));
    browseSort = { key: 'rows', asc: false };
    renderBrowseHead([
      { key: 'name', label: t('tab_domicile') },
      { key: 'investors', label: t('investors') },
      { key: 'stocks', label: t('col_stocks') },
      { key: 'rows', label: t('rows'), numeric: true }
    ]);
  }

  document.getElementById('browseCount').textContent = `${fmt.format(browseData.length)} ${t('items')}`;
  sortAndRenderBrowse();
}

let browseCols = [];

function renderBrowseHead(cols) {
  browseCols = cols;
  const head = document.getElementById('browseHead');
  head.innerHTML = '<tr>' + cols.map(c => {
    const arrow = browseSort.key === c.key ? (browseSort.asc ? ' ▲' : ' ▼') : '';
    const align = c.numeric ? ' style="text-align:right"' : '';
    return `<th data-key="${c.key}"${align}>${c.label}<span class="sort-arrow">${arrow}</span></th>`;
  }).join('') + '</tr>';

  head.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (browseSort.key === key) browseSort.asc = !browseSort.asc;
      else { browseSort.key = key; browseSort.asc = browseCols.find(c => c.key === key)?.numeric ? false : true; }
      browsePage = 1;
      renderBrowseHead(browseCols);
      sortAndRenderBrowse();
    });
  });
}

function sortAndRenderBrowse() {
  const sorted = [...browseData].sort((a, b) => {
    const va = a[browseSort.key], vb = b[browseSort.key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return browseSort.asc ? cmp : -cmp;
  });

  const total = sorted.length;
  const totalPages = Math.ceil(total / browsePageSize);
  if (browsePage > totalPages) browsePage = totalPages;
  if (browsePage < 1) browsePage = 1;
  const start = (browsePage - 1) * browsePageSize;
  const page = sorted.slice(start, start + browsePageSize);
  const mode = searchMode;

  const tbody = document.getElementById('browseBody');
  tbody.innerHTML = page.map(row => {
    const cells = browseCols.map(c => {
      let val = row[c.key];
      if (c.key === 'code') {
        const url = getLogoUrl(val);
        const logo = url ? `<img class="stock-logo-sm" src="${url}" alt="" onerror="this.style.display='none'">` : '';
        return `<td>${logo}<span class="td-ticker">${esc(val)}</span></td>`;
      }
      if (c.key === 'name' && mode === 'investor') {
        return `<td><span class="investor-link">${esc(val)}</span></td>`;
      }
      if (c.key === 'totalShares' || c.key === 'rows') return `<td style="text-align:right;font-variant-numeric:tabular-nums">${fmt.format(val)}</td>`;
      if (c.numeric) return `<td style="text-align:right;font-variant-numeric:tabular-nums">${typeof val === 'number' ? fmt.format(val) : (val || '—')}</td>`;
      return `<td title="${esc(String(val || ''))}">${esc(String(val || '—'))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach((tr, i) => {
    tr.addEventListener('click', () => {
      const row = page[i];
      if (mode === 'investor') navigateToInvestor(row.name);
      else if (mode === 'stock') selectStock(row.code);
      else if (mode === 'nationality') {
        const filtered = allData.filter(r => r.nationality === row.name);
        navigate('holdings');
        setTimeout(() => { if (!filtersInitialized) initHoldingsPage(); showFilteredHoldings(filtered, `Nationality: ${row.name}`); }, 50);
      } else if (mode === 'domicile') {
        const filtered = allData.filter(r => r.domicile === row.name);
        navigate('holdings');
        setTimeout(() => { if (!filtersInitialized) initHoldingsPage(); showFilteredHoldings(filtered, `Domicile: ${row.name}`); }, 50);
      }
    });
  });

  renderBrowsePagination(totalPages, total, start, page.length);
}

function renderBrowsePagination(totalPages, total, start, count) {
  const pag = document.getElementById('browsePagination');
  if (totalPages <= 1) { pag.innerHTML = `<span class="page-info">${t('showing_all')} ${fmt.format(total)} ${t('items')}</span>`; return; }

  let btns = `<button ${browsePage <= 1 ? 'disabled' : ''} data-bp="${browsePage - 1}">&laquo; ${t('prev')}</button>`;
  const pages = getPaginationRange(browsePage, totalPages);
  for (const p of pages) {
    if (p === '...') btns += `<span class="page-ellipsis">...</span>`;
    else btns += `<button data-bp="${p}" class="${p === browsePage ? 'active' : ''}">${p}</button>`;
  }
  btns += `<button ${browsePage >= totalPages ? 'disabled' : ''} data-bp="${browsePage + 1}">${t('next')} &raquo;</button>`;

  pag.innerHTML = `
    <span class="page-info">${t('showing')} ${fmt.format(start + 1)}–${fmt.format(start + count)} ${t('of')} ${fmt.format(total)}</span>
    <div class="page-buttons">${btns}</div>
  `;

  pag.querySelectorAll('button[data-bp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.bp);
      if (p >= 1 && p <= totalPages) { browsePage = p; sortAndRenderBrowse(); }
    });
  });
}

function getSearchResults(q) {
  if (searchMode === 'investor') {
    return investorNames.filter(n => n.toLowerCase().includes(q)).slice(0, 12).map(name => {
      const count = investorMap.get(name).length;
      return { value: name, html: highlightMatch(name, q), badge: `${count} stock${count > 1 ? 's' : ''}` };
    });
  }
  if (searchMode === 'stock') {
    return stockNames
      .filter(code => {
        const s = stockMap.get(code);
        return code.toLowerCase().includes(q) || s.issuer.toLowerCase().includes(q);
      })
      .slice(0, 12)
      .map(code => {
        const s = stockMap.get(code);
        const label = code + ' — ' + s.issuer;
        const logoUrl = getLogoUrl(code);
        const logoHtml = logoUrl ? `<img class="stock-logo-sm" src="${logoUrl}" alt="" onerror="this.style.display='none'">` : '';
        return { value: code, html: logoHtml + highlightMatch(label, q), badge: `${s.rows.length} holder${s.rows.length > 1 ? 's' : ''}` };
      });
  }
  if (searchMode === 'nationality') {
    return nationalityList.filter(n => n.toLowerCase().includes(q)).slice(0, 12).map(name => {
      const count = allData.filter(r => r.nationality === name).length;
      return { value: name, html: highlightMatch(name, q), badge: `${count} row${count > 1 ? 's' : ''}` };
    });
  }
  if (searchMode === 'domicile') {
    return domicileList.filter(n => n.toLowerCase().includes(q)).slice(0, 12).map(name => {
      const count = allData.filter(r => r.domicile === name).length;
      return { value: name, html: highlightMatch(name, q), badge: `${count} row${count > 1 ? 's' : ''}` };
    });
  }
  return [];
}

function selectResult(value, mode) {
  const input = document.getElementById('search');
  input.value = value;
  closeAutocomplete();

  if (mode === 'investor') {
    selectInvestor(value);
    return;
  }

  if (mode === 'stock') {
    selectStock(value);
    return;
  }

  let filtered, title;
  if (mode === 'nationality') {
    filtered = allData.filter(r => r.nationality === value);
    title = `Nationality: ${value}`;
  } else if (mode === 'domicile') {
    filtered = allData.filter(r => r.domicile === value);
    title = `Domicile: ${value}`;
  }

  navigate('holdings');
  setTimeout(() => {
    if (!filtersInitialized) initHoldingsPage();
    showFilteredHoldings(filtered, title);
  }, 50);
}

function selectStock(code) {
  const s = stockMap.get(code);
  if (!s) return;

  if (currentPage !== 'explorer') navigate('explorer');

  document.getElementById('explorerEmpty').style.display = 'none';
  document.getElementById('dashboard').classList.remove('visible');
  hideExplorerStockChart();

  const detail = document.getElementById('stockDetail');
  detail.style.display = '';
  document.getElementById('stockDetailCode').textContent = code;
  document.getElementById('stockDetailIssuer').textContent = s.issuer;
  setStockLogo(document.getElementById('stockDetailLogo'), code);

  const rows = s.rows;
  const totalShares = rows.reduce((sum, r) => sum + r.total_holding_shares, 0);
  const topHolder = rows.reduce((a, b) => a.percentage > b.percentage ? a : b);
  const types = [...new Set(rows.map(r => r.investor_type).filter(Boolean))];

  const tl = TYPE_LABELS_MAP();
  document.getElementById('stockDetailStats').innerHTML = `
    <div class="stat-card" data-tip="${tt('tip_major_holders')}">
      <div class="stat-label">${t('stat_major_holders')}</div>
      <div class="stat-value">${rows.length}</div>
      <div class="stat-sub">${t('sub_gt1_stake')}</div>
    </div>
    <div class="stat-card" data-tip="${tt('tip_total_shares_held')}">
      <div class="stat-label">${t('stat_total_shares_held')}</div>
      <div class="stat-value">${fmt.format(totalShares)}</div>
      <div class="stat-sub">${t('sub_by_major')}</div>
    </div>
    <div class="stat-card" data-tip="${tt('tip_largest_holder')}">
      <div class="stat-label">${t('stat_largest_holder')}</div>
      <div class="stat-value stat-value-lg">${esc(topHolder.investor_name)}</div>
      <div class="stat-sub">${fmtPct(topHolder.percentage)} ${t('stake')}</div>
    </div>
    <div class="stat-card" data-tip="${tt('tip_holder_types')}">
      <div class="stat-label">${t('stat_holder_types')}</div>
      <div class="stat-value stat-value-md">${types.map(tp => tl[tp] || tp).join(', ') || 'N/A'}</div>
      <div class="stat-sub">${types.length} ${types.length !== 1 ? t('distinct_types') : t('distinct_type')}</div>
    </div>
  `;

  renderStockGraph(code, rows);
  renderStockPie(rows);
  injectAdvancedChart('stockDetailChart', 'IDX:' + code, 420);
  renderStockDetailTable(rows);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderStockGraph(code, rows) {
  const container = document.getElementById('stock-graph-container');
  container.querySelectorAll('svg').forEach(s => s.remove());
  container.style.minHeight = '520px';

  const width = container.clientWidth || 700;
  const height = 520;

  const stockNode = { id: '__stock__', name: code, type: 'stock-center' };
  const holderNodes = rows.map(r => ({
    id: r.investor_name,
    name: r.investor_name,
    pct: r.percentage,
    shares: r.total_holding_shares,
    investorType: r.investor_type,
    localForeign: r.local_foreign,
    type: 'holder'
  }));

  const nodes = [stockNode, ...holderNodes];
  const links = holderNodes.map(h => ({ source: '__stock__', target: h.id, pct: h.pct }));

  const maxPct = d3.max(rows, r => r.percentage) || 1;
  const radiusScale = d3.scaleSqrt().domain([0, maxPct]).range([20, 44]);
  const linkScale = d3.scaleLinear().domain([0, maxPct]).range([1.5, 7]);

  const cx = width / 2;
  const cy = height / 2;
  stockNode.x = cx;
  stockNode.y = cy;
  stockNode.fx = cx;
  stockNode.fy = cy;
  const nHold = holderNodes.length;
  holderNodes.forEach((d, i) => {
    const ang = (nHold ? i / nHold : 0) * 2 * Math.PI - Math.PI / 2;
    const rad = Math.min(width, height) * 0.32;
    d.x = cx + Math.cos(ang) * rad;
    d.y = cy + Math.sin(ang) * rad;
  });

  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('overflow', 'visible')
    .style('width', '100%').style('height', '520px').style('display', 'block');

  const defs = svg.append('defs');
  const glow = defs.append('filter').attr('id', 'sglow');
  glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
  glow.append('feMerge').selectAll('feMergeNode')
    .data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', d => d);

  const sim = d3.forceSimulation(nodes)
    .velocityDecay(0.66)
    .alphaDecay(0.05)
    .alphaMin(0.001)
    .force('link', d3.forceLink(links).id(d => d.id).distance(d => 118 + (1 - d.pct / maxPct) * 52).strength(0.92))
    .force('charge', d3.forceManyBody().strength(-260))
    .force('center', d3.forceCenter(cx, cy).strength(0.035))
    .force('x', d3.forceX(cx).strength(0.018))
    .force('y', d3.forceY(cy).strength(0.018))
    .force('collide', d3.forceCollide().radius(d => {
      if (d.type === 'stock-center') return 46;
      const r = radiusScale(d.pct);
      return r + 34;
    }).iterations(2));

  const link = svg.append('g').selectAll('line').data(links).join('line')
    .attr('stroke', GRAPH_LINK_STROKE)
    .attr('stroke-width', d => linkScale(d.pct))
    .attr('stroke-opacity', 0.95)
    .attr('stroke-linecap', 'round')
    .attr('pointer-events', 'none');

  const graphPad = 48;
  let draggingHub = false;
  const svgNode = svg.node();
  const node = svg.append('g').selectAll('g').data(nodes).join('g')
    .attr('cursor', 'grab')
    .call(d3.drag()
      .container(() => svgNode)
      .filter(event => !event.ctrlKey && !event.button)
      .on('start', (e, d) => {
        if (!e.active) sim.alphaTarget(0.35).restart();
        if (d.type === 'stock-center') draggingHub = true;
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (e, d) => {
        const src = e.sourceEvent || e;
        const [px, py] = d3.pointer(src, svgNode);
        d.fx = Math.max(graphPad, Math.min(width - graphPad, px));
        d.fy = Math.max(graphPad, Math.min(height - graphPad, py));
      })
      .on('end', (e, d) => {
        if (!e.active) sim.alphaTarget(0);
        if (d.type === 'stock-center') {
          draggingHub = false;
          d.fx = cx;
          d.fy = cy;
          d.x = cx;
          d.y = cy;
          sim.alpha(0.22).restart();
        } else {
          d.fx = null;
          d.fy = null;
        }
      })
    );

  node.each(function(d) {
    const g = d3.select(this);
    if (d.type === 'stock-center') {
      const cUrl = getLogoUrl(code);
      g.append('circle').attr('r', 42).attr('fill', cUrl ? 'var(--surface2)' : 'var(--green)').attr('filter', 'url(#sglow)').attr('opacity', 0.95).attr('stroke', 'var(--green)').attr('stroke-width', cUrl ? 2 : 0)
        .attr('pointer-events', 'all');
      if (cUrl) {
        const clip = defs.append('clipPath').attr('id', 'sclip');
        clip.append('circle').attr('r', 38);
        g.append('image').attr('href', cUrl).attr('width', 52).attr('height', 52).attr('x', -26).attr('y', -26).attr('clip-path', 'url(#sclip)').attr('pointer-events', 'none');
        g.append('text').attr('text-anchor', 'middle').attr('dy', '3.5em')
          .attr('fill', 'var(--chrome-bright)').attr('font-size', '11px').attr('font-weight', '700').attr('pointer-events', 'none').text(d.name);
      } else {
        g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.15em')
          .attr('fill', '#fff').attr('font-size', '15px').attr('font-weight', '800').attr('pointer-events', 'none').text(d.name);
        g.append('text').attr('text-anchor', 'middle').attr('dy', '1.2em')
          .attr('fill', 'rgba(255,255,255,0.7)').attr('font-size', '10px').attr('font-weight', '600').attr('pointer-events', 'none').text('STOCK');
      }
    } else {
      const r = radiusScale(d.pct);
      const fill = graphNodeFillForType(d.investorType);
      const ring = graphNodeStrokeForFill(fill);
      const fo = g.append('foreignObject')
        .attr('x', -80)
        .attr('y', r + 6)
        .attr('width', 160)
        .attr('height', 140)
        .attr('pointer-events', 'none')
        .style('overflow', 'visible');
      fo.append('xhtml:div')
        .style('text-align', 'center')
        .style('font-size', '10px')
        .style('font-weight', '700')
        .style('color', '#e8eaed')
        .style('line-height', '1.3')
        .style('word-break', 'break-word')
        .style('max-height', '3.6em')
        .style('overflow', 'hidden')
        .style('pointer-events', 'none')
        .text(d.name);
      g.append('circle').attr('r', r).attr('fill', fill).attr('opacity', 1)
        .attr('stroke', ring || 'none').attr('stroke-width', ring ? 1.5 : 0)
        .attr('pointer-events', 'all');
      g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
        .attr('fill', '#fff').attr('font-size', Math.min(14, 9 + r * 0.22) + 'px').attr('font-weight', '800')
        .attr('stroke', 'rgba(0,0,0,0.35)').attr('stroke-width', '0.5px')
        .attr('pointer-events', 'none')
        .text(fmtPct(d.pct));
    }
  });

  const tooltip = document.getElementById('tooltip');
  node.filter(d => d.type === 'holder')
    .on('mouseover', (e, d) => {
      tooltip.innerHTML = `
        <div class="tt-ticker">${esc(d.name)}</div>
        <div class="tt-issuer">${TYPE_LABELS_MAP()[d.investorType] || 'N/A'} · ${d.localForeign === 'L' ? t('local') : d.localForeign === 'F' ? t('foreign') : '—'}</div>
        <div class="tt-row"><span class="tt-label">${t('col_stake_pct')}</span><span class="tt-val">${fmtPct(d.pct)}</span></div>
        <div class="tt-row"><span class="tt-label">${t('col_total_shares')}</span><span class="tt-val">${fmt.format(d.shares)}</span></div>
      `;
      tooltip.classList.add('show');
    })
    .on('mousemove', e => { tooltip.style.left = (e.clientX + 14) + 'px'; tooltip.style.top = (e.clientY - 10) + 'px'; })
    .on('mouseout', () => { tooltip.classList.remove('show'); })
    .on('click', (e, d) => { navigateToInvestor(d.name); });

  node.filter(d => d.type === 'stock-center')
    .on('click', () => { selectStock(code); });

  sim.on('tick', () => {
    nodes.forEach(d => {
      if (d.type === 'stock-center') {
        if (!draggingHub) {
          d.fx = cx;
          d.fy = cy;
          d.x = cx;
          d.y = cy;
        }
      } else {
        d.x = Math.max(graphPad, Math.min(width - graphPad, d.x));
        d.y = Math.max(graphPad, Math.min(height - graphPad, d.y));
      }
    });
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  const usedTypes = [...new Set(rows.map(r => r.investor_type))];
  document.getElementById('stock-legend').innerHTML =
    usedTypes.map(tp => `<div class="legend-item"><div class="legend-dot" style="background:${TYPE_COLORS[tp] || TYPE_COLORS['']}"></div>${tp || '?'} — ${TYPE_LABELS_MAP()[tp] || t('unclassified')}</div>`).join('');

  const hint = container.parentElement.querySelector('.graph-hint');
  if (!hint) {
    const hintEl = document.createElement('div');
    hintEl.className = 'graph-hint';
    hintEl.textContent = t('graph_hint_stock');
    container.parentElement.querySelector('.legend').after(hintEl);
  }
}

function renderStockPie(rows) {
  const container = document.getElementById('stock-pie-container');
  container.innerHTML = '';

  const size = 260, radius = size / 2, inner = radius * 0.55;
  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${size} ${size}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .append('g').attr('transform', `translate(${radius},${radius})`);

  const totalShares = rows.reduce((s, r) => s + r.total_holding_shares, 0);
  const pieData = rows.map(r => ({ name: r.investor_name, value: r.total_holding_shares, pct: r.percentage, type: r.investor_type }))
    .sort((a, b) => b.value - a.value);

  const pie = d3.pie().value(d => d.value).sort(null).padAngle(0.02);
  const arc = d3.arc().innerRadius(inner).outerRadius(radius - 4);
  const arcHover = d3.arc().innerRadius(inner).outerRadius(radius);

  const color = d3.scaleOrdinal()
    .domain(pieData.map(d => d.name))
    .range(d3.quantize(t => d3.interpolateRainbow(t * 0.8 + 0.1), Math.max(pieData.length, 2)));

  const tooltip = document.getElementById('tooltip');

  svg.selectAll('path').data(pie(pieData)).join('path')
    .attr('d', arc).attr('fill', d => color(d.data.name))
    .attr('stroke', 'var(--surface)').attr('stroke-width', 1)
    .attr('cursor', 'pointer')
    .on('mouseover', function(e, d) {
      d3.select(this).transition().duration(150).attr('d', arcHover);
      const sharePct = totalShares > 0 ? (d.data.value / totalShares * 100).toFixed(1) : 0;
      tooltip.innerHTML = `
        <div class="tt-ticker">${esc(d.data.name)}</div>
        <div class="tt-row"><span class="tt-label">Shares</span><span class="tt-val">${fmt.format(d.data.value)}</span></div>
        <div class="tt-row"><span class="tt-label">Of total held</span><span class="tt-val">${sharePct}%</span></div>
        <div class="tt-row"><span class="tt-label">Stake in co.</span><span class="tt-val">${fmtPct(d.data.pct)}</span></div>
      `;
      tooltip.classList.add('show');
    })
    .on('mousemove', e => { tooltip.style.left = (e.clientX + 14) + 'px'; tooltip.style.top = (e.clientY - 10) + 'px'; })
    .on('mouseout', function() { d3.select(this).transition().duration(150).attr('d', arc); tooltip.classList.remove('show'); })
    .on('click', (e, d) => { navigateToInvestor(d.data.name); });

  if (pieData.length <= 8) {
    svg.selectAll('text.pie-label').data(pie(pieData)).join('text')
      .attr('class', 'pie-label').attr('transform', d => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('fill', '#fff').attr('font-size', '9px').attr('font-weight', '600')
      .text(d => d.data.name.split(' ')[0]);
  }

  svg.append('text').attr('text-anchor', 'middle').attr('dy', '-0.2em')
    .attr('fill', 'var(--text)').attr('font-size', '18px').attr('font-weight', '700').text(pieData.length);
  svg.append('text').attr('text-anchor', 'middle').attr('dy', '1.2em')
    .attr('fill', 'var(--text-dim)').attr('font-size', '11px').text(t('pie_holders'));
}

const STOCK_DETAIL_COLS = [
  { key: 'investor_name', lk: 'tab_investor', tk: 'investor_name', fmt: v => `<a class="investor-link" href="#">${esc(v)}</a>` },
  { key: 'investor_type', lk: 'col_type', tk: 'investor_type', fmt: v => v ? `<span class="type-badge" data-tip="${TYPE_TIPS_MAP()[v] || ''}" style="background:${TYPE_COLORS[v]}22;color:${TYPE_COLORS[v]}">${v}</span>` : '—' },
  { key: 'local_foreign', lk: 'col_lf', tk: 'local_foreign', fmt: v => v === 'L' ? `<span data-tip="${tt('tip_local')}">${t('local')}</span>` : v === 'F' ? `<span data-tip="${tt('tip_foreign')}">${t('foreign')}</span>` : '—' },
  { key: 'nationality', lk: 'col_nationality', tk: 'nationality' },
  { key: 'total_holding_shares', lk: 'col_total_shares', tk: 'total_holding_shares', fmt: v => fmt.format(v), numeric: true },
  { key: 'percentage', lk: 'col_stake_pct', tk: 'percentage', fmt: null, numeric: true }
];

let stockDetailSort = { key: 'percentage', asc: false };
let stockDetailRows = [];

function renderStockDetailTable(rows) {
  stockDetailRows = rows;
  stockDetailSort = { key: 'percentage', asc: false };
  renderStockDetailHead();
  renderStockDetailBody();
}

function renderStockDetailHead() {
  const tips = I18N[currentLang].col_tips;
  document.getElementById('stockDetailTableHead').innerHTML = '<tr>' + STOCK_DETAIL_COLS.map(c => {
    const arrow = stockDetailSort.key === c.key ? (stockDetailSort.asc ? ' ▲' : ' ▼') : '';
    const tipVal = tips[c.tk] || '';
    const tipAttr = tipVal ? ` data-tip="${tipVal}"` : '';
    return `<th data-key="${c.key}"${tipAttr}>${t(c.lk)}<span class="sort-arrow">${arrow}</span></th>`;
  }).join('') + '</tr>';

  document.querySelectorAll('#stockDetailTableHead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (stockDetailSort.key === key) stockDetailSort.asc = !stockDetailSort.asc;
      else { stockDetailSort.key = key; stockDetailSort.asc = key === 'investor_name'; }
      renderStockDetailHead();
      renderStockDetailBody();
    });
  });
}

function renderStockDetailBody() {
  const sorted = [...stockDetailRows].sort((a, b) => {
    const primary = stableCompare(a, b, stockDetailSort.key, stockDetailSort.asc);
    if (primary !== 0) return primary;
    return stableCompare(a, b, 'investor_name', true);
  });

  const maxPct = d3.max(stockDetailRows, r => r.percentage) || 1;
  const tbody = document.getElementById('stockDetailTableBody');

  tbody.innerHTML = sorted.map(r => {
    const cells = STOCK_DETAIL_COLS.map(c => {
      if (c.key === 'percentage') {
        const w = (r.percentage / maxPct * 100).toFixed(1);
        return `<td><div class="pct-bar-wrap"><div class="pct-bar"><div class="pct-bar-fill" style="width:${w}%"></div></div><span class="pct-val">${fmtPct(r.percentage)}</span></div></td>`;
      }
      const val = c.fmt ? c.fmt(r[c.key]) : (r[c.key] || '—');
      return `<td title="${esc(String(r[c.key] || ''))}">${val}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  tbody.querySelectorAll('.investor-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateToInvestor(link.textContent);
    });
  });
}

function highlightMatch(name, query) {
  const idx = name.toLowerCase().indexOf(query);
  if (idx === -1) return esc(name);
  return esc(name.slice(0, idx)) + '<mark>' + esc(name.slice(idx, idx + query.length)) + '</mark>' + esc(name.slice(idx + query.length));
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Allowlist for dynamic CSS class segments (classification, risk flags, etc.). */
function safeCssClass(s) {
  const t = String(s ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
  return t || 'x';
}

function setStockLogo(el, code) {
  el.textContent = code.slice(0, 2);
  el.className = 'stock-logo-fallback';
  const url = getLogoUrl(code);
  if (url) {
    const img = new Image();
    img.src = url;
    img.onload = () => {
      el.innerHTML = `<img class="stock-logo" src="${url}" alt="${esc(code)} logo">`;
      el.style.background = 'none';
    };
  }
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ── Investor Detail (Explorer) ────────────────────────────── */

function selectInvestor(name) {
  const input = document.getElementById('search');
  input.value = name;
  closeAutocomplete();

  const rows = investorMap.get(name);
  if (!rows) return;

  document.getElementById('explorerEmpty').style.display = 'none';
  document.getElementById('stockDetail').style.display = 'none';
  document.getElementById('dashboard').classList.add('visible');
  document.getElementById('investorName').textContent = name;
  document.getElementById('investorAvatar').textContent = getInitials(name);

  const types = [...new Set(rows.map(r => r.investor_type).filter(Boolean))];
  const typeLabel = types.map(tp => `${tp} — ${TYPE_LABELS_MAP()[tp] || tp}`).join(', ') || 'N/A';
  const lf = [...new Set(rows.map(r => r.local_foreign).filter(Boolean))];
  const lfLabel = lf.map(v => v === 'L' ? t('local') : t('foreign')).join(' / ') || 'N/A';
  document.getElementById('investorSub').textContent = `${typeLabel}  ·  ${lfLabel}`;

  const badges = document.getElementById('investorBadges');
  badges.innerHTML = '';
  const profile = intelProfileMap.get(name);
  if (profile) {
    const _ct = CLASSIFICATION_TIPS_MAP(), _cl = CLASS_LABELS_MAP(), _rl = RISK_FLAG_LABELS_MAP(), _rt = RISK_FLAG_TIPS_MAP();
    badges.innerHTML += `<span class="classification-badge ${safeCssClass(profile.classification)}" data-tip="${esc(_ct[profile.classification] || '')}">${esc(_cl[profile.classification] || profile.classification.replace('_', ' '))}</span>`;
    if (profile.group_id) {
      const gLabel = getGroupLabel(profile.group_id);
      if (gLabel) {
        badges.innerHTML += `<span class="group-tag" data-tip="${esc(tt('tip_group_tag_explorer'))}" data-gid="${esc(profile.group_id)}" role="link" tabindex="0">${esc(gLabel)}</span>`;
      }
    }
    (profile.risk_flags || []).forEach(f => {
      badges.innerHTML += `<span class="risk-flag ${safeCssClass(f)}" data-tip="${esc(_rt[f] || '')}">${esc(_rl[f] || f)}</span>`;
    });
  }
  badges.querySelectorAll('.group-tag[data-gid]').forEach(el => {
    const go = () => {
      const gid = el.dataset.gid;
      if (!gid) return;
      navigate('intelligence');
      setTimeout(() => scrollToGroup(gid), 200);
    };
    el.addEventListener('click', e => { e.preventDefault(); go(); });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });

  hideExplorerStockChart();
  renderStats(rows);
  renderGraph(name, rows);
  renderPie(rows);
  renderInvestorTable(rows);
}

/* ── Stats Cards ───────────────────────────────────────────── */

function renderStats(rows) {
  const totalShares = rows.reduce((s, r) => s + r.total_holding_shares, 0);
  const largest = rows.reduce((a, b) => a.percentage > b.percentage ? a : b);
  const avgPct = rows.reduce((s, r) => s + r.percentage, 0) / rows.length;

  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card" data-tip="${tt('tip_stocks_held')}">
      <div class="stat-label">${t('stat_stocks_held')}</div>
      <div class="stat-value">${rows.length}</div>
      <div class="stat-sub">${t('sub_listed_cos')}</div>
    </div>
    <div class="stat-card" data-tip="${tt('tip_total_shares')}">
      <div class="stat-label">${t('stat_total_shares')}</div>
      <div class="stat-value">${fmt.format(totalShares)}</div>
      <div class="stat-sub">${t('sub_across_all')}</div>
    </div>
    <div class="stat-card" data-tip="${tt('tip_largest_stake')}">
      <div class="stat-label">${t('stat_largest_stake')}</div>
      <div class="stat-value stat-value-lg">${largest.share_code}</div>
      <div class="stat-sub">${fmtPct(largest.percentage)} — ${largest.issuer_name}</div>
    </div>
    <div class="stat-card" data-tip="${tt('tip_avg_stake')}">
      <div class="stat-label">${t('stat_avg_stake')}</div>
      <div class="stat-value">${fmtPct(avgPct)}</div>
      <div class="stat-sub">${t('sub_mean_pct')}</div>
    </div>
  `;
}

/* ── Force Network Graph ───────────────────────────────────── */

function renderGraph(name, rows) {
  const container = document.getElementById('graph-container');
  container.querySelectorAll('svg').forEach(s => s.remove());

  const width = container.clientWidth || 700;
  const height = 520;

  const investorNode = { id: '__investor__', name: name, type: 'investor' };
  const stockNodes = rows.map(r => ({
    id: r.share_code, name: r.share_code, issuer: r.issuer_name,
    pct: r.percentage, shares: r.total_holding_shares,
    investorType: r.investor_type, type: 'stock'
  }));

  const nodes = [investorNode, ...stockNodes];
  const links = stockNodes.map(s => ({ source: '__investor__', target: s.id, pct: s.pct }));

  const maxPct = d3.max(rows, r => r.percentage) || 1;
  const radiusScale = d3.scaleSqrt().domain([0, maxPct]).range([22, 48]);
  const linkScale = d3.scaleLinear().domain([0, maxPct]).range([1.5, 7]);

  const cx = width / 2;
  const cy = height / 2;
  investorNode.x = cx;
  investorNode.y = cy;
  investorNode.fx = cx;
  investorNode.fy = cy;
  const nSt = stockNodes.length;
  stockNodes.forEach((d, i) => {
    const ang = (nSt ? i / nSt : 0) * 2 * Math.PI - Math.PI / 2;
    const rad = Math.min(width, height) * 0.32;
    d.x = cx + Math.cos(ang) * rad;
    d.y = cy + Math.sin(ang) * rad;
  });

  const svg = d3.select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('overflow', 'visible');

  const defs = svg.append('defs');
  const glow = defs.append('filter').attr('id', 'glow');
  glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
  glow.append('feMerge').selectAll('feMergeNode')
    .data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', d => d);

  const sim = d3.forceSimulation(nodes)
    .velocityDecay(0.66)
    .alphaDecay(0.05)
    .alphaMin(0.001)
    .force('link', d3.forceLink(links).id(d => d.id).distance(d => 118 + (1 - d.pct / maxPct) * 52).strength(0.92))
    .force('charge', d3.forceManyBody().strength(-260))
    .force('center', d3.forceCenter(cx, cy).strength(0.035))
    .force('x', d3.forceX(cx).strength(0.018))
    .force('y', d3.forceY(cy).strength(0.018))
    .force('collide', d3.forceCollide().radius(d => {
      if (d.type === 'investor') return 48;
      const r = radiusScale(d.pct);
      return r + 36;
    }).iterations(2));

  const link = svg.append('g')
    .selectAll('line').data(links).join('line')
    .attr('stroke', GRAPH_LINK_STROKE)
    .attr('stroke-width', d => linkScale(d.pct))
    .attr('stroke-opacity', 0.95)
    .attr('stroke-linecap', 'round')
    .attr('pointer-events', 'none');

  const graphPad = 48;
  let draggingHub = false;
  const svgNode = svg.node();
  const node = svg.append('g')
    .selectAll('g').data(nodes).join('g')
    .attr('cursor', 'grab')
    .call(d3.drag()
      .container(() => svgNode)
      .filter(event => !event.ctrlKey && !event.button)
      .on('start', (e, d) => {
        if (!e.active) sim.alphaTarget(0.35).restart();
        if (d.type === 'investor') draggingHub = true;
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (e, d) => {
        const src = e.sourceEvent || e;
        const [px, py] = d3.pointer(src, svgNode);
        d.fx = Math.max(graphPad, Math.min(width - graphPad, px));
        d.fy = Math.max(graphPad, Math.min(height - graphPad, py));
      })
      .on('end', (e, d) => {
        if (!e.active) sim.alphaTarget(0);
        if (d.type === 'investor') {
          draggingHub = false;
          d.fx = cx;
          d.fy = cy;
          d.x = cx;
          d.y = cy;
          sim.alpha(0.22).restart();
        } else {
          d.fx = null;
          d.fy = null;
        }
      })
    );

  node.each(function(d) {
    const g = d3.select(this);
    if (d.type === 'investor') {
      const fo = g.append('foreignObject')
        .attr('x', -120)
        .attr('y', 46)
        .attr('width', 240)
        .attr('height', 200)
        .attr('pointer-events', 'none')
        .style('overflow', 'visible');
      fo.append('xhtml:div')
        .style('text-align', 'center')
        .style('font-size', '11px')
        .style('font-weight', '700')
        .style('color', '#e8f4f8')
        .style('line-height', '1.35')
        .style('word-break', 'break-word')
        .style('max-height', '4.2em')
        .style('overflow', 'hidden')
        .style('pointer-events', 'none')
        .text(d.name);
      g.append('circle').attr('r', 40).attr('fill', 'var(--accent)').attr('filter', 'url(#glow)').attr('opacity', 0.95)
        .attr('pointer-events', 'all');
    } else {
      const r = radiusScale(d.pct);
      const nUrl = getLogoUrl(d.id);
      const fill = graphNodeFillForType(d.investorType);
      const ring = graphNodeStrokeForFill(fill);
      if (nUrl) {
        const clipId = 'ic_' + d.id.replace(/[^a-zA-Z0-9]/g, '');
        const clip = defs.append('clipPath').attr('id', clipId);
        clip.append('circle').attr('r', r - 3);
        const imgS = (r - 3) * 1.6;
        g.append('circle').attr('r', r).attr('fill', 'var(--surface2)').attr('opacity', 1)
          .attr('stroke', fill).attr('stroke-width', 2.5)
          .attr('pointer-events', 'all');
        g.append('image').attr('href', nUrl).attr('width', imgS).attr('height', imgS).attr('x', -imgS / 2).attr('y', -imgS / 2).attr('clip-path', `url(#${clipId})`).attr('pointer-events', 'none');
        g.append('text').attr('text-anchor', 'middle').attr('dy', r + 12)
          .attr('fill', 'var(--chrome-bright)').attr('font-size', '10px').attr('font-weight', '700').attr('pointer-events', 'none').text(fmtPct(d.pct));
      } else {
        g.append('circle').attr('r', r).attr('fill', fill).attr('opacity', 1)
          .attr('stroke', ring || 'none').attr('stroke-width', ring ? 1.5 : 0)
          .attr('pointer-events', 'all');
        g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.2em')
          .attr('fill', '#fff').attr('font-size', '13px').attr('font-weight', '800')
          .attr('stroke', 'rgba(0,0,0,0.3)').attr('stroke-width', '0.5px').attr('pointer-events', 'none').text(d.id);
        g.append('text').attr('text-anchor', 'middle').attr('dy', '1.1em')
          .attr('fill', '#fff').attr('font-size', '11px').attr('font-weight', '700')
          .attr('stroke', 'rgba(0,0,0,0.3)').attr('stroke-width', '0.5px').attr('pointer-events', 'none').text(fmtPct(d.pct));
      }
    }
  });

  const tooltip = document.getElementById('tooltip');
  node.filter(d => d.type === 'stock')
    .on('mouseover', (e, d) => {
      tooltip.innerHTML = `
        <div class="tt-ticker">${d.id}</div>
        <div class="tt-issuer">${d.issuer}</div>
        <div class="tt-row"><span class="tt-label">${t('col_stake_pct')}</span><span class="tt-val">${fmtPct(d.pct)}</span></div>
        <div class="tt-row"><span class="tt-label">${t('col_total_shares')}</span><span class="tt-val">${fmt.format(d.shares)}</span></div>
        <div class="tt-row"><span class="tt-label">${t('col_type')}</span><span class="tt-val">${TYPE_LABELS_MAP()[d.investorType] || 'N/A'}</span></div>
      `;
      tooltip.classList.add('show');
    })
    .on('mousemove', e => {
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY - 10) + 'px';
    })
    .on('mouseout', () => { tooltip.classList.remove('show'); })
    .on('click', (e, d) => { selectStock(d.id); });

  sim.on('tick', () => {
    nodes.forEach(d => {
      if (d.type === 'investor') {
        if (!draggingHub) {
          d.fx = cx;
          d.fy = cy;
          d.x = cx;
          d.y = cy;
        }
      } else {
        d.x = Math.max(graphPad, Math.min(width - graphPad, d.x));
        d.y = Math.max(graphPad, Math.min(height - graphPad, d.y));
      }
    });
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  const usedTypes = [...new Set(rows.map(r => r.investor_type))];
  document.getElementById('legend').innerHTML =
    usedTypes.map(tp => `<div class="legend-item"><div class="legend-dot" style="background:${TYPE_COLORS[tp] || TYPE_COLORS['']}"></div>${tp || '?'} — ${TYPE_LABELS_MAP()[tp] || t('unclassified')}</div>`).join('');

  const hint = container.parentElement.querySelector('.graph-hint');
  if (!hint) {
    const hintEl = document.createElement('div');
    hintEl.className = 'graph-hint';
    hintEl.textContent = t('graph_hint_inv');
    container.parentElement.querySelector('.legend').after(hintEl);
  }
}

/* ── Pie / Donut Chart ─────────────────────────────────────── */

function renderPie(rows) {
  const container = document.getElementById('pie-container');
  container.innerHTML = '';

  const size = 260;
  const radius = size / 2;
  const inner = radius * 0.55;

  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${size} ${size}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .append('g').attr('transform', `translate(${radius},${radius})`);

  const totalShares = rows.reduce((s, r) => s + r.total_holding_shares, 0);
  const pieData = rows.map(r => ({ code: r.share_code, value: r.total_holding_shares, pct: r.percentage, type: r.investor_type }))
    .sort((a, b) => b.value - a.value);

  const pie = d3.pie().value(d => d.value).sort(null).padAngle(0.02);
  const arc = d3.arc().innerRadius(inner).outerRadius(radius - 4);
  const arcHover = d3.arc().innerRadius(inner).outerRadius(radius);

  const color = d3.scaleOrdinal()
    .domain(pieData.map(d => d.code))
    .range(d3.quantize(t => d3.interpolateRainbow(t * 0.8 + 0.1), Math.max(pieData.length, 2)));

  const tooltip = document.getElementById('tooltip');

  svg.selectAll('path').data(pie(pieData)).join('path')
    .attr('d', arc).attr('fill', d => color(d.data.code))
    .attr('stroke', 'var(--surface)').attr('stroke-width', 1)
    .on('mouseover', function(e, d) {
      d3.select(this).transition().duration(150).attr('d', arcHover);
      const sharePct = totalShares > 0 ? (d.data.value / totalShares * 100).toFixed(1) : 0;
      tooltip.innerHTML = `
        <div class="tt-ticker">${d.data.code}</div>
        <div class="tt-row"><span class="tt-label">Shares</span><span class="tt-val">${fmt.format(d.data.value)}</span></div>
        <div class="tt-row"><span class="tt-label">Of portfolio</span><span class="tt-val">${sharePct}%</span></div>
        <div class="tt-row"><span class="tt-label">Stake in co.</span><span class="tt-val">${fmtPct(d.data.pct)}</span></div>
      `;
      tooltip.classList.add('show');
    })
    .on('mousemove', e => {
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY - 10) + 'px';
    })
    .on('mouseout', function() {
      d3.select(this).transition().duration(150).attr('d', arc);
      tooltip.classList.remove('show');
    })
    .attr('cursor', 'pointer')
    .on('click', (e, d) => { selectStock(d.data.code); });

  if (pieData.length <= 8) {
    svg.selectAll('text.pie-label').data(pie(pieData)).join('text')
      .attr('class', 'pie-label')
      .attr('transform', d => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('fill', '#fff').attr('font-size', '10px').attr('font-weight', '600')
      .text(d => d.data.code);
  }

  svg.append('text').attr('text-anchor', 'middle').attr('dy', '-0.2em')
    .attr('fill', 'var(--text)').attr('font-size', '18px').attr('font-weight', '700').text(pieData.length);
  svg.append('text').attr('text-anchor', 'middle').attr('dy', '1.2em')
    .attr('fill', 'var(--text-dim)').attr('font-size', '11px').text(t('pie_stocks'));
}

/* ── Investor Table (Explorer) ─────────────────────────────── */

function stockLogoImg(code) {
  const url = getLogoUrl(code);
  return url ? `<img class="stock-logo-sm" src="${url}" alt="" onerror="this.style.display='none'">` : '';
}

const TABLE_COLS = [
  { key: 'share_code', lk: 'col_ticker', tk: 'share_code', fmt: v => `${stockLogoImg(v)}<a class="td-ticker stock-chart-link" href="#" data-ticker="${v}">${v}</a>` },
  { key: 'issuer_name', lk: 'col_issuer', tk: 'issuer_name' },
  { key: 'investor_type', lk: 'col_type', tk: 'investor_type', fmt: v => v ? `<span class="type-badge" data-tip="${TYPE_TIPS_MAP()[v] || ''}" style="background:${TYPE_COLORS[v]}22;color:${TYPE_COLORS[v]}">${v}</span>` : '—' },
  { key: 'local_foreign', lk: 'col_lf', tk: 'local_foreign', fmt: v => v === 'L' ? `<span data-tip="${tt('tip_local')}">${t('local')}</span>` : v === 'F' ? `<span data-tip="${tt('tip_foreign')}">${t('foreign')}</span>` : '—' },
  { key: 'nationality', lk: 'col_nationality', tk: 'nationality' },
  { key: 'total_holding_shares', lk: 'col_total_shares', tk: 'total_holding_shares', fmt: v => fmt.format(v), numeric: true },
  { key: 'percentage', lk: 'col_stake_pct', tk: 'percentage', fmt: null, numeric: true }
];

let currentSort = { key: 'percentage', asc: false };

function renderInvestorTable(rows) {
  renderInvestorTableHead();
  renderInvestorTableBody(rows);
}

function renderInvestorTableHead() {
  const tips = I18N[currentLang].col_tips;
  document.getElementById('tableHead').innerHTML = '<tr>' + TABLE_COLS.map(c => {
    const arrow = currentSort.key === c.key ? (currentSort.asc ? ' ▲' : ' ▼') : '';
    const tipVal = tips[c.tk] || '';
    const tipAttr = tipVal ? ` data-tip="${tipVal}"` : '';
    return `<th data-key="${c.key}"${tipAttr}>${t(c.lk)}<span class="sort-arrow">${arrow}</span></th>`;
  }).join('') + '</tr>';

  document.querySelectorAll('#tableHead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (currentSort.key === key) currentSort.asc = !currentSort.asc;
      else { currentSort.key = key; currentSort.asc = false; }
      const name = document.getElementById('investorName').textContent;
      const rows = investorMap.get(name);
      if (rows) renderInvestorTable(rows);
    });
  });
}

function renderInvestorTableBody(rows) {
  const sorted = [...rows].sort((a, b) => {
    const primary = stableCompare(a, b, currentSort.key, currentSort.asc);
    if (primary !== 0) return primary;
    return stableCompare(a, b, 'share_code', true);
  });

  const maxPct = d3.max(rows, r => r.percentage) || 1;

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = sorted.map(r => {
    const cells = TABLE_COLS.map(c => {
      if (c.key === 'percentage') {
        const w = (r.percentage / maxPct * 100).toFixed(1);
        return `<td><div class="pct-bar-wrap"><div class="pct-bar"><div class="pct-bar-fill" style="width:${w}%"></div></div><span class="pct-val">${fmtPct(r.percentage)}</span></div></td>`;
      }
      const val = c.fmt ? c.fmt(r[c.key]) : r[c.key];
      return `<td title="${esc(String(r[c.key] || ''))}">${val || '—'}</td>`;
    }).join('');
    return `<tr data-ticker="${r.share_code}">${cells}</tr>`;
  }).join('');

  tbody.querySelectorAll('.stock-chart-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      selectStock(link.dataset.ticker);
    });
  });
}

/* ── Holdings Page (All-Data Table) ────────────────────────── */

const ALL_COLS = [
  { key: 'share_code', lk: 'col_ticker', tk: 'share_code', fmt: v => `${stockLogoImg(v)}<a class="stock-chart-link" data-ticker="${esc(v)}" href="#">${esc(v)}</a>` },
  { key: 'issuer_name', lk: 'col_issuer', tk: 'issuer_name' },
  { key: 'investor_name', lk: 'tab_investor', tk: 'investor_name', fmt: v => `<a class="investor-link" href="#">${esc(v)}</a>` },
  { key: 'investor_type', lk: 'col_type', tk: 'investor_type', fmt: v => v ? `<span class="type-badge" data-tip="${TYPE_TIPS_MAP()[v] || ''}" style="background:${TYPE_COLORS[v]}22;color:${TYPE_COLORS[v]}">${v}</span>` : '—' },
  { key: 'local_foreign', lk: 'col_lf', tk: 'local_foreign', fmt: v => v === 'L' ? `<span data-tip="${tt('tip_local')}">${t('local')}</span>` : v === 'F' ? `<span data-tip="${tt('tip_foreign')}">${t('foreign')}</span>` : '—' },
  { key: 'nationality', lk: 'col_nationality', tk: 'nationality' },
  { key: 'total_holding_shares', lk: 'col_total_shares', tk: 'total_holding_shares', fmt: v => fmt.format(v), numeric: true },
  { key: 'percentage', lk: 'col_stake_pct', tk: 'percentage', fmt: null, numeric: true }
];

let allSort = { key: 'share_code', asc: true };
let allPage = 1;
let pageSize = 10;
let allSorted = [];
let filteredData = null;
let activeFilters = {};

function initHoldingsPage() {
  filtersInitialized = true;

  resetHoldingsView();
  setupFilters();

  document.getElementById('allTableBody').addEventListener('click', e => {
    const link = e.target.closest('.investor-link');
    if (link) {
      e.preventDefault();
      navigateToInvestor(link.textContent);
    }
  });

  document.getElementById('holdingsReset').addEventListener('click', resetHoldingsView);
}

function resetHoldingsView() {
  document.getElementById('holdingsTitle').textContent = t('all_holdings');
  document.getElementById('holdingsReset').style.display = 'none';
  filteredData = null;
  const stockCount = new Set(allData.map(r => r.share_code)).size;
  document.getElementById('allRowCount').textContent = `${fmt.format(allData.length)} ${t('rows')} · ${investorNames.length} ${t('investors')} · ${stockCount} ${t('stocks')}`;
  allPage = 1;
  sortAllData();
  renderAllHead();
  renderAllPage();
}

function showFilteredHoldings(rows, title) {
  document.getElementById('holdingsTitle').textContent = title;
  document.getElementById('holdingsReset').style.display = '';
  document.getElementById('allRowCount').textContent = `${fmt.format(rows.length)} ${t('rows')}`;
  filteredData = rows;
  allPage = 1;
  sortAllData();
  renderAllHead();
  renderAllPage();
}

function stableCompare(a, b, key, asc) {
  let va = a[key], vb = b[key];
  const aEmpty = (va === '' || va === null || va === undefined);
  const bEmpty = (vb === '' || vb === null || vb === undefined);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
  if (va < vb) return asc ? -1 : 1;
  if (va > vb) return asc ? 1 : -1;
  return 0;
}

function getActiveData() {
  const base = filteredData || allData;
  return applyColumnFilters(base);
}

function sortAllData() {
  allSorted = [...getActiveData()].sort((a, b) => {
    const primary = stableCompare(a, b, allSort.key, allSort.asc);
    if (primary !== 0) return primary;
    const byCode = stableCompare(a, b, 'share_code', true);
    if (byCode !== 0) return byCode;
    return stableCompare(a, b, 'investor_name', true);
  });
}

function renderAllHead() {
  const tips = I18N[currentLang].col_tips;
  document.getElementById('allTableHead').innerHTML = '<tr>' + ALL_COLS.map(c => {
    const arrow = allSort.key === c.key ? (allSort.asc ? ' ▲' : ' ▼') : '';
    const tipVal = tips[c.tk] || '';
    const tipAttr = tipVal ? ` data-tip="${tipVal}"` : '';
    return `<th data-key="${c.key}"${tipAttr}>${t(c.lk)}<span class="sort-arrow">${arrow}</span></th>`;
  }).join('') + '</tr>';

  document.querySelectorAll('#allTableHead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (allSort.key === key) allSort.asc = !allSort.asc;
      else { allSort.key = key; allSort.asc = true; }
      allPage = 1;
      sortAllData();
      renderAllHead();
      renderAllPage();
    });
  });
}

function renderAllPage() {
  const total = allSorted.length;
  const totalPages = Math.ceil(total / pageSize);
  if (allPage > totalPages) allPage = totalPages;
  if (allPage < 1) allPage = 1;
  const start = (allPage - 1) * pageSize;
  const pageRows = allSorted.slice(start, start + pageSize);

  const maxPct = d3.max(getActiveData(), r => r.percentage) || 1;
  const tbody = document.getElementById('allTableBody');
  const fragment = document.createDocumentFragment();

  pageRows.forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.ticker = r.share_code;
    tr.innerHTML = ALL_COLS.map(c => {
      if (c.key === 'percentage') {
        const w = (r.percentage / maxPct * 100).toFixed(1);
        return `<td><div class="pct-bar-wrap"><div class="pct-bar"><div class="pct-bar-fill" style="width:${w}%"></div></div><span class="pct-val">${fmtPct(r.percentage)}</span></div></td>`;
      }
      const val = c.fmt ? c.fmt(r[c.key]) : (r[c.key] || '—');
      return `<td title="${esc(String(r[c.key] || ''))}">${val}</td>`;
    }).join('');
    fragment.appendChild(tr);
  });

  tbody.innerHTML = '';
  tbody.appendChild(fragment);

  tbody.querySelectorAll('.investor-link').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); navigateToInvestor(link.textContent); });
  });
  tbody.querySelectorAll('.stock-chart-link').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); selectStock(link.dataset.ticker); });
  });

  renderAllPagination(totalPages, total, start, pageRows.length);
}

function renderAllPagination(totalPages, total, start, count) {
  const pag = document.getElementById('allPagination');
  const endIdx = start + count;

  let btns = '';
  btns += `<button ${allPage <= 1 ? 'disabled' : ''} data-page="${allPage - 1}" aria-label="Previous page">&laquo; ${t('prev')}</button>`;

  const pages = getPaginationRange(allPage, totalPages);
  for (const p of pages) {
    if (p === '...') {
      btns += `<span class="page-ellipsis">...</span>`;
    } else {
      btns += `<button data-page="${p}" class="${p === allPage ? 'active' : ''}" aria-label="Page ${p}">${p}</button>`;
    }
  }
  btns += `<button ${allPage >= totalPages ? 'disabled' : ''} data-page="${allPage + 1}" aria-label="Next page">${t('next')} &raquo;</button>`;

  const sizeOptions = [10, 15, 20, 30, 50, 75, 100].map(n =>
    `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`
  ).join('');

  pag.innerHTML = `
    <span class="page-info">${total === 0 ? t('no_results') : `${t('showing')} ${fmt.format(start + 1)}–${fmt.format(endIdx)} ${t('of')} ${fmt.format(total)}`}</span>
    <div class="page-size-wrap">
      <label>${t('rows_label')}</label>
      <select id="pageSizeSelect" aria-label="Rows per page">${sizeOptions}</select>
    </div>
    <div class="page-buttons">${btns}</div>
  `;

  document.getElementById('pageSizeSelect').addEventListener('change', e => {
    pageSize = parseInt(e.target.value);
    allPage = 1;
    renderAllPage();
  });

  pag.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages) {
        allPage = p;
        renderAllPage();
      }
    });
  });
}

function getPaginationRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

/* ── Filter Panel Logic ─────────────────────────────────────── */

function setupFilters() {
  const fToggle = document.getElementById('filterToggle');
  const fPanel = document.getElementById('filterPanel');
  fToggle.addEventListener('click', () => {
    const isOpen = fPanel.classList.toggle('open');
    fToggle.setAttribute('aria-expanded', isOpen);
  });

  const typeValues = [...new Set(allData.map(r => r.investor_type).filter(Boolean))].sort();
  document.getElementById('filterInvestorType').innerHTML = typeValues.map(tp =>
    `<label class="filter-chip"><input type="checkbox" value="${tp}"> ${tp} — ${TYPE_LABELS_MAP()[tp] || tp}</label>`
  ).join('');

  const lfValues = [{v:'L',l:'Local'},{v:'F',l:'Foreign'}];
  document.getElementById('filterLocalForeign').innerHTML = lfValues.map(x =>
    `<label class="filter-chip"><input type="checkbox" value="${x.v}"> ${x.l}</label>`
  ).join('');

  document.getElementById('filterNationality').innerHTML = nationalityList.map(n =>
    `<label class="filter-chip"><input type="checkbox" value="${esc(n)}"> ${esc(n)}</label>`
  ).join('');

  document.getElementById('filterDomicile').innerHTML = domicileList.map(n =>
    `<label class="filter-chip"><input type="checkbox" value="${esc(n)}"> ${esc(n)}</label>`
  ).join('');

  document.querySelectorAll('.filter-chip input').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.filter-chip').classList.toggle('checked', cb.checked);
    });
  });

  document.querySelectorAll('.filter-range select').forEach(sel => {
    sel.addEventListener('change', () => {
      const wrap = sel.closest('.filter-range');
      const v2 = wrap.querySelector('.range-val2');
      v2.style.display = sel.value === 'between' ? '' : 'none';
    });
  });

  document.getElementById('filterApply').addEventListener('click', applyFilters);
  document.getElementById('filterClear').addEventListener('click', clearFilters);
}

function parseFilterNum(val) {
  if (!val) return NaN;
  return parseFloat(val.replace(/\./g, '').replace(',', '.'));
}

function applyFilters() {
  activeFilters = {};

  const typeChecked = [...document.querySelectorAll('#filterInvestorType input:checked')].map(c => c.value);
  if (typeChecked.length) activeFilters.investor_type = typeChecked;

  const lfChecked = [...document.querySelectorAll('#filterLocalForeign input:checked')].map(c => c.value);
  if (lfChecked.length) activeFilters.local_foreign = lfChecked;

  const natChecked = [...document.querySelectorAll('#filterNationality input:checked')].map(c => c.value);
  if (natChecked.length) activeFilters.nationality = natChecked;

  const domChecked = [...document.querySelectorAll('#filterDomicile input:checked')].map(c => c.value);
  if (domChecked.length) activeFilters.domicile = domChecked;

  document.querySelectorAll('.filter-range').forEach(wrap => {
    const field = wrap.dataset.field;
    const op = wrap.querySelector('select').value;
    const v1 = parseFilterNum(wrap.querySelector('.range-val1').value);
    const v2 = parseFilterNum(wrap.querySelector('.range-val2').value);
    if (!isNaN(v1)) {
      activeFilters[field] = { op, v1, v2: isNaN(v2) ? null : v2 };
    }
  });

  const count = Object.keys(activeFilters).length;
  const toggle = document.getElementById('filterToggle');
  const badge = document.getElementById('filterCount');
  toggle.classList.toggle('has-filters', count > 0);
  badge.textContent = count;

  allPage = 1;
  sortAllData();
  renderAllHead();
  renderAllPage();
  updateRowCount();
}

function clearFilters() {
  document.querySelectorAll('.filter-panel input[type=checkbox]').forEach(cb => {
    cb.checked = false;
    cb.closest('.filter-chip').classList.remove('checked');
  });
  document.querySelectorAll('.filter-range input').forEach(inp => { inp.value = ''; });
  document.querySelectorAll('.filter-range select').forEach(sel => {
    sel.value = 'gte';
    sel.closest('.filter-range').querySelector('.range-val2').style.display = 'none';
  });
  activeFilters = {};
  document.getElementById('filterToggle').classList.remove('has-filters');
  document.getElementById('filterCount').textContent = '0';

  allPage = 1;
  sortAllData();
  renderAllHead();
  renderAllPage();
  updateRowCount();
}

function updateRowCount() {
  const data = getActiveData();
  document.getElementById('allRowCount').textContent = `${fmt.format(data.length)} ${t('rows')}`;
}

function applyColumnFilters(data) {
  if (!Object.keys(activeFilters).length) return data;
  return data.filter(r => {
    for (const [key, val] of Object.entries(activeFilters)) {
      if (Array.isArray(val)) {
        if (!val.includes(r[key])) return false;
      } else {
        const rv = r[key];
        if (val.op === 'gte' && !(rv >= val.v1)) return false;
        if (val.op === 'lte' && !(rv <= val.v1)) return false;
        if (val.op === 'eq' && rv !== val.v1) return false;
        if (val.op === 'between') {
          if (val.v2 !== null) { if (rv < val.v1 || rv > val.v2) return false; }
          else { if (rv < val.v1) return false; }
        }
      }
    }
    return true;
  });
}

/* ── Market Page (TradingView Widgets) ──────────────────────── */

function initMarketPage() {
  marketInitialized = true;
  injectTickerTape();
  injectAdvancedChart('chartIHSG', 'IDX:COMPOSITE', 400);
  injectAdvancedChart('chartLQ45', 'IDX:LQ45', 400);
  injectHeatmap();
}

function injectTickerTape() {
  const container = document.getElementById('marketTickerTape');
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'tradingview-widget-container';
  wrapper.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
  container.appendChild(wrapper);

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
  script.async = true;
  script.textContent = JSON.stringify({
    symbols: [
      { proName: 'IDX:COMPOSITE', title: 'IHSG' },
      { proName: 'IDX:LQ45', title: 'LQ45' },
      { proName: 'IDX:IDX30', title: 'IDX30' },
      { proName: 'IDX:BBCA', title: 'BBCA' },
      { proName: 'IDX:BBRI', title: 'BBRI' },
      { proName: 'IDX:BMRI', title: 'BMRI' },
      { proName: 'IDX:BBNI', title: 'BBNI' },
      { proName: 'IDX:TLKM', title: 'TLKM' },
      { proName: 'IDX:ASII', title: 'ASII' },
      { proName: 'IDX:UNVR', title: 'UNVR' },
      { proName: 'IDX:GOTO', title: 'GOTO' },
      { proName: 'IDX:ADRO', title: 'ADRO' }
    ],
    showSymbolLogo: true,
    isTransparent: true,
    displayMode: 'adaptive',
    colorTheme: 'dark',
    locale: 'en'
  });
  wrapper.appendChild(script);
}

function injectAdvancedChart(containerId, symbol, height) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  container.style.height = height + 'px';

  const wrapper = document.createElement('div');
  wrapper.className = 'tradingview-widget-container';
  wrapper.style.height = '100%';
  wrapper.style.width = '100%';
  wrapper.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
  container.appendChild(wrapper);

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.textContent = JSON.stringify({
    autosize: true,
    symbol: symbol,
    interval: 'D',
    timezone: 'Asia/Jakarta',
    theme: 'dark',
    style: '1',
    backgroundColor: 'rgba(21, 24, 33, 1)',
    gridColor: 'rgba(42, 47, 66, 0.4)',
    locale: 'en',
    allow_symbol_change: true,
    withdateranges: true,
    hide_side_toolbar: false,
    calendar: false,
    support_host: 'https://www.tradingview.com'
  });
  wrapper.appendChild(script);
}

/* ── Home Index Chart ──────────────────────────────────────── */

const INDEX_OPTIONS = [
  { symbol: 'IDX:COMPOSITE', label: 'IHSG' },
  { symbol: 'IDX:LQ45', label: 'LQ45' },
  { symbol: 'IDX:IDX30', label: 'IDX30' },
  { symbol: 'IDX:KOMPAS100', label: 'Kompas100' },
  { symbol: 'IDX:ISSI', label: 'ISSI' },
  { symbol: 'IDX:IDXFINANCE', label: 'Finance' }
];

let homeIndexSymbol = 'IDX:COMPOSITE';
let homeChartInitialized = false;

function initHomeIndexChart() {
  if (homeChartInitialized) return;
  homeChartInitialized = true;

  const picks = document.getElementById('homeIndexPicks');
  picks.innerHTML = INDEX_OPTIONS.map(o =>
    `<button class="stock-pick-btn${o.symbol === homeIndexSymbol ? ' active' : ''}" data-symbol="${o.symbol}">${o.label}</button>`
  ).join('');

  picks.addEventListener('click', e => {
    const btn = e.target.closest('.stock-pick-btn');
    if (!btn) return;
    const symbol = btn.dataset.symbol;
    if (symbol === homeIndexSymbol) return;
    homeIndexSymbol = symbol;
    picks.querySelectorAll('.stock-pick-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.symbol === symbol)
    );
    injectAdvancedChart('homeIndexChart', symbol, 420);
  });

  injectAdvancedChart('homeIndexChart', homeIndexSymbol, 420);
}

function hideExplorerStockChart() {
  /* no-op: kept for call-site compatibility */
}

function injectHeatmap() {
  const container = document.getElementById('marketHeatmap');
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'tradingview-widget-container';
  wrapper.style.height = '100%';
  wrapper.style.width = '100%';
  wrapper.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
  container.appendChild(wrapper);

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
  script.async = true;
  script.textContent = JSON.stringify({
    exchanges: [],
    dataSource: 'AllID',
    grouping: 'sector',
    blockSize: 'market_cap_basic',
    blockColor: 'change',
    locale: 'en',
    symbolUrl: '',
    colorTheme: 'dark',
    hasTopBar: true,
    isDataSetEnabled: true,
    isZoomEnabled: true,
    hasSymbolTooltip: true,
    isMonoSize: false,
    width: '100%',
    height: '100%'
  });
  wrapper.appendChild(script);
}

/* ══════════════════════════════════════════════════════════════
   INTELLIGENCE PAGE
   ══════════════════════════════════════════════════════════════ */

async function initIntelligencePage() {
  if (intelInitialized) return;
  if (!intelProfiles.length) {
    try {
      const [pResp, gResp] = await Promise.all([
        fetch(new URL('investor_profiles.json', OUTPUT_BASE)),
        fetch(new URL('investor_groups.json', OUTPUT_BASE))
      ]);
      if (!pResp.ok || !gResp.ok) throw new Error(t('failed_intel'));
      intelProfiles = await pResp.json();
      intelGroups = await gResp.json();
      intelProfileMap = new Map(intelProfiles.map(p => [p.name, p]));
    } catch (err) {
      document.getElementById('intelStats').innerHTML =
        `<div class="error-banner"><h3>${t('failed_intel')}</h3><p>${esc(err.message)}</p></div>`;
      return;
    }
  }
  intelInitialized = true;
  renderIntelStats();
  await renderIntelCharts();
  setupIntelDirectory();
  setupIntelGroups();
  setupIntelViewToggle();
}

function renderIntelStats() {
  const total = intelProfiles.length;
  const groups = intelGroups.length;
  const avgPort = total > 0 ? (intelProfiles.reduce((s, p) => s + p.portfolio_size, 0) / total).toFixed(1) : '0';
  const natCounts = {};
  intelProfiles.forEach(p => { if (p.nationality) natCounts[p.nationality] = (natCounts[p.nationality] || 0) + 1; });
  const topNat = Object.entries(natCounts).sort((a, b) => b[1] - a[1])[0];
  const fmtEN = new Intl.NumberFormat('en-US');

  document.getElementById('intelStats').innerHTML = `
    <div class="intel-stat-card" data-tip="${tt('tip_intel_total')}">
      <div class="stat-label">${t('stat_total_investors')}</div>
      <div class="stat-value">${fmtEN.format(total)}</div>
      <div class="stat-sub">${t('sub_unique_gt1')}</div>
    </div>
    <div class="intel-stat-card" data-tip="${tt('tip_intel_groups')}">
      <div class="stat-label">${t('stat_groups_detected')}</div>
      <div class="stat-value">${fmtEN.format(groups)}</div>
      <div class="stat-sub">${t('sub_conglomerates')}</div>
    </div>
    <div class="intel-stat-card" data-tip="${tt('tip_intel_avg')}">
      <div class="stat-label">${t('stat_avg_portfolio')}</div>
      <div class="stat-value">${avgPort}</div>
      <div class="stat-sub">${t('sub_stocks_per')}</div>
    </div>
    <div class="intel-stat-card" data-tip="${tt('tip_intel_nat')}">
      <div class="stat-label">${t('stat_top_nat')}</div>
      <div class="stat-value" style="font-size:20px;letter-spacing:0">${topNat ? esc(topNat[0]) : 'N/A'}</div>
      <div class="stat-sub">${topNat ? fmtEN.format(topNat[1]) + ' ' + t('investors') : ''}</div>
    </div>
  `;
}

/* ── D3 Charts for Intelligence (lazy chunk) ─────────────── */

async function renderIntelCharts() {
  const mod = await import('./charts/intel-charts.js');
  mod.renderIntelCharts(intelProfiles, { t, TYPE_LABELS_MAP, TYPE_COLORS });
}

/* ── Intel Directory ─────────────────────────────────────── */

let intelDirData = [];
let intelDirPage = 1;
let intelDirPerPage = 25;
let intelDirSort = { key: 'portfolio_size', asc: false };
let intelDirFilter = '';
let intelDirClassFilter = 'all';

const INTEL_DIR_COLS = [
  { key: 'name',           lk: 'tab_investor',    tk: 'investor',      numeric: false },
  { key: 'classification', lk: 'col_class',       tk: 'classification', numeric: false },
  { key: 'local_foreign',  lk: 'col_lf',          tk: 'lf',            numeric: false },
  { key: 'nationality',    lk: 'tab_nationality', tk: 'nat',           numeric: false },
  { key: 'portfolio_size', lk: 'col_stocks',      tk: 'portfolio_size', numeric: true },
  { key: 'avg_pct',        lk: 'col_avg_pct',     tk: 'avg_pct',       numeric: true },
  { key: 'group_id',       lk: 'col_group',       tk: 'group_id',      numeric: false },
];

function setupIntelDirectory() {
  renderIntelClassTabs();
  renderIntelDirHead();
  filterAndRenderIntelDir();

  document.getElementById('intelSearch').addEventListener('input', debounce(e => {
    intelDirFilter = e.target.value.toLowerCase();
    intelDirPage = 1;
    filterAndRenderIntelDir();
  }, 200));
}

function renderIntelClassTabs() {
  const classes = ['all', 'individual', 'company', 'broker', 'mutual_fund', 'insurance', 'pension_fund', 'government', 'foundation', 'other'];
  const labels = CLASS_LABELS_MAP();
  const cTips = CLASSIFICATION_TIPS_MAP();
  const classCounts = {};
  intelProfiles.forEach(p => { classCounts[p.classification] = (classCounts[p.classification] || 0) + 1; });
  classCounts.all = intelProfiles.length;
  const el = document.getElementById('intelClassTabs');
  el.innerHTML = classes.filter(c => c === 'all' || (classCounts[c] || 0) > 0).map(c =>
    `<button class="intel-tab${c === intelDirClassFilter ? ' active' : ''}" data-class="${c}" data-tip="${esc(cTips[c] || '')}">${esc(labels[c] || c)} <span style="opacity:0.6;font-weight:400">${classCounts[c] || 0}</span></button>`
  ).join('');
  el.querySelectorAll('.intel-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      intelDirClassFilter = btn.dataset.class;
      intelDirPage = 1;
      el.querySelectorAll('.intel-tab').forEach(b => b.classList.toggle('active', b === btn));
      filterAndRenderIntelDir();
    });
  });
}

function renderIntelDirHead() {
  const thead = document.getElementById('intelDirectoryHead');
  const tips = I18N[currentLang].col_tips;
  thead.innerHTML = '<tr>' + INTEL_DIR_COLS.map(col => {
    const arrow = intelDirSort.key === col.key ? (intelDirSort.asc ? ' ▲' : ' ▼') : '';
    const styles = `cursor:pointer;white-space:nowrap;${col.numeric ? 'text-align:right;' : ''}`;
    const tipVal = tips[col.tk] || '';
    return `<th data-col="${col.key}" style="${styles}" data-tip="${esc(tipVal)}">${t(col.lk)}${arrow}</th>`;
  }).join('') + '</tr>';

  thead.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.col;
      if (intelDirSort.key === key) intelDirSort.asc = !intelDirSort.asc;
      else { intelDirSort.key = key; intelDirSort.asc = true; }
      renderIntelDirHead();
      filterAndRenderIntelDir();
    });
  });
}

function filterAndRenderIntelDir() {
  let data = intelProfiles;

  if (intelDirClassFilter !== 'all') {
    data = data.filter(p => p.classification === intelDirClassFilter);
  }

  if (intelDirFilter) {
    data = data.filter(p =>
      p.name.toLowerCase().includes(intelDirFilter) ||
      (p.nationality || '').toLowerCase().includes(intelDirFilter) ||
      (p.domicile || '').toLowerCase().includes(intelDirFilter) ||
      (p.group_id || '').toLowerCase().includes(intelDirFilter)
    );
  }

  const { key, asc } = intelDirSort;
  const col = INTEL_DIR_COLS.find(c => c.key === key);
  data = [...data].sort((a, b) => {
    let va = a[key], vb = b[key];
    if (va == null || va === '') va = col.numeric ? -Infinity : 'zzz';
    if (vb == null || vb === '') vb = col.numeric ? -Infinity : 'zzz';
    let cmp = col.numeric ? (va - vb) : String(va).localeCompare(String(vb));
    return asc ? cmp : -cmp;
  });

  intelDirData = data;
  renderIntelDirBody();
}

function getGroupLabel(gid) {
  if (!gid) return '';
  const g = intelGroups.find(x => x.id === gid);
  return g ? g.label : gid;
}

function renderIntelDirBody() {
  const tbody = document.getElementById('intelDirectoryBody');
  const total = intelDirData.length;
  const totalPages = Math.max(1, Math.ceil(total / intelDirPerPage));
  if (intelDirPage > totalPages) intelDirPage = totalPages;
  const start = (intelDirPage - 1) * intelDirPerPage;
  const slice = intelDirData.slice(start, start + intelDirPerPage);

  if (!total) {
    tbody.innerHTML = `<tr><td colspan="${INTEL_DIR_COLS.length}" style="text-align:center;padding:40px;color:var(--text-muted)">${t('no_investors_match')}</td></tr>`;
    document.getElementById('intelPagination').innerHTML = '';
    return;
  }

  const rfl = RISK_FLAG_LABELS_MAP(), rft = RISK_FLAG_TIPS_MAP(), ct = CLASSIFICATION_TIPS_MAP(), cl = CLASS_LABELS_MAP();
  tbody.innerHTML = slice.map(p => {
    const gLabel = getGroupLabel(p.group_id);
    const groupHtml = gLabel ? `<span class="group-tag" data-tip="${tt('tip_group_tag')}" data-gid="${esc(p.group_id)}">${esc(gLabel)}</span>` : '<span style="color:var(--text-muted)">—</span>';
    const flags = (p.risk_flags || []).slice(0, 2).map(f => `<span class="risk-flag ${safeCssClass(f)}" data-tip="${esc(rft[f] || '')}">${esc(rfl[f] || f)}</span>`).join('');
    const lfTip = p.local_foreign === 'L' ? `data-tip="${tt('tip_local')}"` : p.local_foreign === 'F' ? `data-tip="${tt('tip_foreign')}"` : '';
    const lfIcon = p.local_foreign === 'L' ? t('local') : p.local_foreign === 'F' ? t('foreign') : '—';
    const clsLabel = cl[p.classification] || p.classification.replace('_', ' ');
    return `<tr data-investor="${esc(p.name)}">
      <td><div class="intel-dir-name" title="${esc(p.name)}">${esc(p.name)}</div>${flags ? '<div style="margin-top:3px">' + flags + '</div>' : ''}</td>
      <td><span class="classification-badge ${safeCssClass(p.classification)}" data-tip="${esc(ct[p.classification] || '')}">${esc(clsLabel)}</span></td>
      <td style="font-size:12px"><span ${lfTip}>${lfIcon}</span></td>
      <td style="font-size:12px">${esc(p.nationality || '—')}</td>
      <td style="text-align:right;font-weight:600">${p.portfolio_size}</td>
      <td style="text-align:right">${fmtPct(p.avg_pct)}</td>
      <td style="white-space:normal;min-width:140px" title="${esc(gLabel)}">${groupHtml}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.closest('.group-tag')) {
        const gid = e.target.closest('.group-tag').dataset.gid;
        scrollToGroup(gid);
        return;
      }
      const name = tr.dataset.investor;
      navigateToInvestor(name);
    });
  });

  renderIntelDirPagination(totalPages, total, start, slice.length);
}

function scrollToGroup(gid) {
  document.getElementById('intelViewGrp').click();
  setTimeout(() => {
    const card = document.querySelector(`.intel-group-card[data-gid="${CSS.escape(gid)}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.borderColor = 'var(--accent)';
      setTimeout(() => { card.style.borderColor = ''; }, 2000);
    }
  }, 100);
}

function renderIntelDirPagination(totalPages, total, start, count) {
  const el = document.getElementById('intelPagination');
  const fmtEN = new Intl.NumberFormat('en-US');
  const showing = total === 0 ? t('no_results') : `${t('showing')} ${start + 1}–${start + count} ${t('of')} ${fmtEN.format(total)}`;

  let pages = '';
  const maxButtons = 7;
  let startP = Math.max(1, intelDirPage - 3);
  let endP = Math.min(totalPages, startP + maxButtons - 1);
  if (endP - startP < maxButtons - 1) startP = Math.max(1, endP - maxButtons + 1);

  for (let i = startP; i <= endP; i++) {
    pages += `<button class="${i === intelDirPage ? 'active' : ''}" data-p="${i}">${i}</button>`;
  }

  el.innerHTML = `
    <span class="page-info">${showing}</span>
    <div class="page-size-wrap">
      <label>${t('rows_label')}</label>
      <select id="intelPerPage">
        ${[10,25,50,100].map(n => `<option value="${n}"${n === intelDirPerPage ? ' selected' : ''}>${n}</option>`).join('')}
      </select>
    </div>
    <div class="page-buttons">
      <button ${intelDirPage <= 1 ? 'disabled' : ''} data-p="prev">‹</button>
      ${pages}
      <button ${intelDirPage >= totalPages ? 'disabled' : ''} data-p="next">›</button>
    </div>`;

  el.querySelector('#intelPerPage').addEventListener('change', e => {
    intelDirPerPage = +e.target.value;
    intelDirPage = 1;
    renderIntelDirBody();
  });

  el.querySelectorAll('.page-buttons button').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.p;
      if (v === 'prev') intelDirPage--;
      else if (v === 'next') intelDirPage++;
      else intelDirPage = +v;
      renderIntelDirBody();
    });
  });
}

/* ── Intel Groups ────────────────────────────────────────── */

let intelGroupFilter = '';

function setupIntelGroups() {
  document.getElementById('intelGroupCount').textContent = intelGroups.length;
  renderIntelGroupCards();

  document.getElementById('intelGroupSearch').addEventListener('input', debounce(e => {
    intelGroupFilter = e.target.value.toLowerCase();
    renderIntelGroupCards();
  }, 200));
}

function renderIntelGroupCards() {
  const grid = document.getElementById('intelGroupsGrid');
  let groups = intelGroups;
  if (intelGroupFilter) {
    groups = groups.filter(g =>
      g.label.toLowerCase().includes(intelGroupFilter) ||
      g.members.some(m => m.toLowerCase().includes(intelGroupFilter))
    );
  }

  if (!groups.length) {
    grid.innerHTML = `<div style="color:var(--text-muted);padding:24px;text-align:center">${t('no_groups_match')}</div>`;
    return;
  }

  const mTips = METHOD_TIPS_MAP(), cTips = CONFIDENCE_TIPS_MAP();
  grid.innerHTML = groups.map(g => {
    const methodKey = g.detection_method || 'name_match';
    const methodLabel = t(methodKey);
    const methodTip = mTips[methodKey] || '';
    const avgPct = g.total_pct_sum / Math.max(1, g.member_count);
    return `
    <div class="intel-group-card" data-gid="${esc(g.id)}">
      <div class="intel-group-card-header">
        <h4>${esc(g.label)}</h4>
        <span class="confidence ${safeCssClass(g.confidence)}" data-tip="${esc(cTips[g.confidence] || '')}">${esc(g.confidence)}</span>
      </div>
      <div class="intel-group-card-stats">
        <span data-tip="${tt('tip_group_members')}"><strong>${g.member_count}</strong> ${t('members')}</span>
        <span data-tip="${tt('tip_group_stocks')}"><strong>${g.total_stocks}</strong> ${t('stocks')}</span>
        <span data-tip="${tt('tip_group_avg')}"><strong>${fmtPct(avgPct)}</strong> ${t('avg')}</span>
      </div>
      <div class="intel-group-card-method" data-tip="${esc(methodTip)}">${esc(methodLabel)}</div>
      <div class="intel-group-card-expand">${t('click_members')}</div>
      <div class="intel-group-detail" id="detail-${esc(g.id)}">
        <div class="intel-group-members">
          ${g.members.map(m => `<span class="intel-group-member-chip" data-investor="${esc(m)}">${esc(m)}</span>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.intel-group-card').forEach(card => {
    const detail = card.querySelector('.intel-group-detail');
    const expandHint = card.querySelector('.intel-group-card-expand');
    card.addEventListener('click', e => {
      if (e.target.closest('.intel-group-member-chip')) {
        navigateToInvestor(e.target.closest('.intel-group-member-chip').dataset.investor);
        return;
      }
      const isOpen = detail.classList.toggle('open');
      if (expandHint) expandHint.textContent = isOpen ? t('click_collapse') : t('click_members');
    });
  });
}

/* ── Intel View Toggle ───────────────────────────────────── */

function setupIntelViewToggle() {
  const dirBtn = document.getElementById('intelViewDir');
  const grpBtn = document.getElementById('intelViewGrp');
  const dirView = document.getElementById('intelDirectoryView');
  const grpView = document.getElementById('intelGroupsView');

  dirBtn.addEventListener('click', () => {
    dirBtn.classList.add('active'); grpBtn.classList.remove('active');
    dirBtn.setAttribute('aria-selected', 'true'); grpBtn.setAttribute('aria-selected', 'false');
    dirView.style.display = ''; grpView.style.display = 'none';
  });
  grpBtn.addEventListener('click', () => {
    grpBtn.classList.add('active'); dirBtn.classList.remove('active');
    grpBtn.setAttribute('aria-selected', 'true'); dirBtn.setAttribute('aria-selected', 'false');
    grpView.style.display = ''; dirView.style.display = 'none';
  });
}


// Global handlers for inline HTML onclick / legacy templates
window.navigate = navigate;
window.setLang = setLang;
window.navigateToInvestor = navigateToInvestor;
window.navigateToStock = navigateToStock;
window.scrollToGroup = scrollToGroup;

init();
