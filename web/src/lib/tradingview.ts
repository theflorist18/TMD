export function injectAdvancedChart(
  container: HTMLElement | null,
  symbol: string,
  height: number
) {
  if (!container) return;
  container.innerHTML = '';
  container.style.height = `${height}px`;

  const wrapper = document.createElement('div');
  wrapper.className = 'tradingview-widget-container';
  wrapper.style.height = '100%';
  wrapper.style.width = '100%';
  wrapper.innerHTML =
    '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
  container.appendChild(wrapper);

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src =
    'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.textContent = JSON.stringify({
    autosize: true,
    symbol,
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
    support_host: 'https://www.tradingview.com',
  });
  wrapper.appendChild(script);
}

export function injectTickerTape(container: HTMLElement | null) {
  if (!container) return;
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'tradingview-widget-container';
  wrapper.innerHTML =
    '<div class="tradingview-widget-container__widget"></div>';
  container.appendChild(wrapper);

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src =
    'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
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
      { proName: 'IDX:ADRO', title: 'ADRO' },
    ],
    showSymbolLogo: true,
    isTransparent: true,
    displayMode: 'adaptive',
    colorTheme: 'dark',
    locale: 'en',
  });
  wrapper.appendChild(script);
}

export function injectHeatmap(container: HTMLElement | null) {
  if (!container) return;
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'tradingview-widget-container';
  wrapper.style.height = '100%';
  wrapper.style.width = '100%';
  wrapper.innerHTML =
    '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
  container.appendChild(wrapper);

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src =
    'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
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
    height: '100%',
  });
  wrapper.appendChild(script);
}
