import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildFreeFloatMap,
  parseFreeFloatJson,
  type FreeFloatPayload,
  type FreeFloatRow,
} from '@/domain/freeFloat';
import { fetchDataset, freeFloatJsonUrl } from '@/api/client';

export type FreeFloatState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      payload: FreeFloatPayload;
      rows: FreeFloatRow[];
      byCode: Map<string, FreeFloatRow>;
    };

export function useFreeFloatDataset() {
  const [state, setState] = useState<FreeFloatState>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const url = freeFloatJsonUrl();
      const resp = await fetchDataset(url);
      if (resp.status === 404) {
        setState({
          status: 'ready',
          payload: { as_of: null, source: '', rows: [] },
          rows: [],
          byCode: new Map(),
        });
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const payload = parseFreeFloatJson(data);
      const byCode = buildFreeFloatMap(payload.rows);
      setState({
        status: 'ready',
        payload,
        rows: payload.rows,
        byCode,
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

  return useMemo(() => ({ state, reload }), [state, reload]);
}
