import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildInvestorMap,
  buildStockMap,
  parseHoldersCsv,
  type HolderRow,
} from '@/domain/holders';
import { fetchDataset, holdersCsvUrl } from '@/api/client';

export type HoldersState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      rows: HolderRow[];
      investorNames: string[];
      stockNames: string[];
      nationalityList: string[];
      domicileList: string[];
    };

export function useHoldersDataset() {
  const [state, setState] = useState<HoldersState>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const url = holdersCsvUrl();
      const resp = await fetchDataset(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const rows = parseHoldersCsv(text);
      const invMap = buildInvestorMap(rows);
      const investorNames = [...invMap.keys()].sort();
      const stockMap = buildStockMap(rows);
      const stockNames = [...stockMap.keys()].sort();
      const nationalityList = [
        ...new Set(rows.map((r) => r.nationality).filter(Boolean)),
      ].sort() as string[];
      const domicileList = [
        ...new Set(rows.map((r) => r.domicile).filter(Boolean)),
      ].sort() as string[];
      setState({
        status: 'ready',
        rows,
        investorNames,
        stockNames,
        nationalityList,
        domicileList,
      });
    } catch (e: unknown) {
      setState({
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ state, reload }), [state, reload]);
  return value;
}
