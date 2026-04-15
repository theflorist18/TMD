import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { injectAdvancedChart, injectHeatmap, injectTickerTape } from '@/lib/tradingview';

export function MarketPage() {
  const { t } = useTranslation();
  const tapeRef = useRef<HTMLDivElement>(null);
  const ihsgRef = useRef<HTMLDivElement>(null);
  const lq45Ref = useRef<HTMLDivElement>(null);
  const heatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    injectTickerTape(tapeRef.current);
    injectAdvancedChart(ihsgRef.current, 'IDX:COMPOSITE', 400);
    injectAdvancedChart(lq45Ref.current, 'IDX:LQ45', 400);
    injectHeatmap(heatRef.current);
  }, []);

  return (
    <section id="page-market" className="page-section page-active">
      <div className="page-content">
        <div className="market-page-header">
          <h2 className="market-section-title">{t('nav_market')}</h2>
          <p>{t('market_sub')}</p>
        </div>

        <div className="market-ticker-tape" ref={tapeRef} />

        <h2 className="market-section-title">{t('index_overview')}</h2>
        <div className="market-index-grid">
          <div className="market-chart-card">
            <div className="card-title">IHSG — IDX Composite</div>
            <div className="market-chart-body" ref={ihsgRef} style={{ height: 400 }} />
          </div>
          <div className="market-chart-card">
            <div className="card-title">LQ45 Index</div>
            <div className="market-chart-body" ref={lq45Ref} style={{ height: 400 }} />
          </div>
        </div>

        <div className="market-heatmap-section">
          <h2 className="market-section-title">{t('market_heatmap')}</h2>
          <div className="market-heatmap" ref={heatRef} style={{ minHeight: 520 }} />
        </div>
      </div>
    </section>
  );
}
