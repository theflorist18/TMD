import * as d3 from 'd3';

export type HolderRow = {
  date: string;
  share_code: string;
  issuer_name: string;
  investor_name: string;
  investor_type: string;
  local_foreign: string;
  nationality: string;
  domicile: string;
  holdings_scripless: number;
  holdings_scrip: number;
  total_holding_shares: number;
  percentage: number;
};

export function parseHoldersCsv(text: string): HolderRow[] {
  return d3.csvParse(text, (d) => ({
    date: String(d.date ?? ''),
    share_code: String(d.share_code ?? ''),
    issuer_name: String(d.issuer_name ?? ''),
    investor_name: String(d.investor_name ?? ''),
    investor_type: String(d.investor_type ?? ''),
    local_foreign: String(d.local_foreign ?? ''),
    nationality: String(d.nationality ?? ''),
    domicile: String(d.domicile ?? ''),
    holdings_scripless: Number(d.holdings_scripless ?? 0),
    holdings_scrip: Number(d.holdings_scrip ?? 0),
    total_holding_shares: Number(d.total_holding_shares ?? 0),
    percentage: Number(d.percentage ?? 0),
  }));
}

export function buildInvestorMap(rows: HolderRow[]) {
  return d3.group(rows, (d) => d.investor_name);
}

export function buildStockMap(rows: HolderRow[]) {
  const m = new Map<
    string,
    { code: string; issuer: string; rows: HolderRow[] }
  >();
  rows.forEach((r) => {
    const key = r.share_code;
    if (!m.has(key)) {
      m.set(key, { code: r.share_code, issuer: r.issuer_name, rows: [] });
    }
    m.get(key)!.rows.push(r);
  });
  return m;
}
