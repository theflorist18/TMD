import type { FreeFloatRow } from '@/domain/freeFloat';
import type { NumericColumnFilter } from '@/lib/holdingsFilters';

export type FreeFloatColumnFilters = {
  free_float_pct?: NumericColumnFilter;
  free_float_shares?: NumericColumnFilter;
  free_float_holders?: NumericColumnFilter;
};

function matchesNumeric(rv: number, f: NumericColumnFilter): boolean {
  const { op, v1, v2 } = f;
  switch (op) {
    case 'gte':
      return rv >= v1;
    case 'lte':
      return rv <= v1;
    case 'eq':
      return rv === v1;
    case 'between':
      if (v2 !== null && Number.isFinite(v2)) return rv >= v1 && rv <= v2;
      return rv >= v1;
    default:
      return true;
  }
}

export function applyFreeFloatFilters(
  rows: FreeFloatRow[],
  af: FreeFloatColumnFilters
): FreeFloatRow[] {
  const pct = af.free_float_pct;
  const sh = af.free_float_shares;
  const ho = af.free_float_holders;
  if (!pct && !sh && !ho) return rows;

  return rows.filter((r) => {
    if (pct) {
      const rv = r.free_float_pct;
      if (!Number.isFinite(rv) || !matchesNumeric(rv, pct)) return false;
    }
    if (sh) {
      const rv = r.free_float_shares;
      if (!Number.isFinite(rv) || !matchesNumeric(rv, sh)) return false;
    }
    if (ho) {
      const rv = r.free_float_holders;
      if (!Number.isFinite(rv) || !matchesNumeric(rv, ho)) return false;
    }
    return true;
  });
}

export function countFreeFloatFilterKeys(af: FreeFloatColumnFilters): number {
  let n = 0;
  if (af.free_float_pct) n += 1;
  if (af.free_float_shares) n += 1;
  if (af.free_float_holders) n += 1;
  return n;
}
