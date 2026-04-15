import type { HolderRow } from '@/domain/holders';

export type RangeOp = 'gte' | 'lte' | 'eq' | 'between';

export type NumericColumnFilter = { op: RangeOp; v1: number; v2: number | null };

export type HoldingsColumnFilters = {
  investor_type?: string[];
  local_foreign?: string[];
  nationality?: string[];
  domicile?: string[];
  percentage?: NumericColumnFilter;
  total_holding_shares?: NumericColumnFilter;
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

export function applyHoldingsFilters(
  rows: HolderRow[],
  af: HoldingsColumnFilters
): HolderRow[] {
  const entries = Object.entries(af).filter(([, v]) => v != null);
  if (!entries.length) return rows;
  return rows.filter((r) => {
    for (const [key, val] of entries) {
      if (Array.isArray(val)) {
        const cell = r[key as keyof HolderRow];
        if (!val.includes(String(cell ?? ''))) return false;
      } else if (val && typeof val === 'object' && 'op' in val) {
        const rv = Number(r[key as keyof HolderRow]);
        if (!Number.isFinite(rv)) return false;
        if (!matchesNumeric(rv, val as NumericColumnFilter)) return false;
      }
    }
    return true;
  });
}

/** Legacy `parseFilterNum`: thousands `.` stripped, decimal `,` → `.` */
export function parseHoldingsFilterNum(val: string): number {
  if (!val?.trim()) return NaN;
  return parseFloat(val.replace(/\./g, '').replace(',', '.'));
}

export function countHoldingsFilterKeys(af: HoldingsColumnFilters): number {
  return Object.keys(af).filter((k) => {
    const v = af[k as keyof HoldingsColumnFilters];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
}
