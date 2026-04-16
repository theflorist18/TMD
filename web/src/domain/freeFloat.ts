export type FreeFloatRow = {
  share_code: string;
  issuer_name: string;
  free_float_pct: number;
  free_float_shares: number;
  free_float_holders: number;
  compliance_status: string;
  sanction_note: string;
};

export type FreeFloatPayload = {
  as_of: string | null;
  source: string;
  rows: FreeFloatRow[];
};

export function parseFreeFloatJson(data: unknown): FreeFloatPayload {
  if (!data || typeof data !== 'object') {
    return { as_of: null, source: '', rows: [] };
  }
  const o = data as Record<string, unknown>;
  const rowsRaw = o.rows;
  const rows: FreeFloatRow[] = [];
  if (Array.isArray(rowsRaw)) {
    for (const r of rowsRaw) {
      if (!r || typeof r !== 'object') continue;
      const x = r as Record<string, unknown>;
      rows.push({
        share_code: String(x.share_code ?? ''),
        issuer_name: String(x.issuer_name ?? ''),
        free_float_pct: Number(x.free_float_pct ?? 0),
        free_float_shares: Number(x.free_float_shares ?? 0),
        free_float_holders: Number(x.free_float_holders ?? 0),
        compliance_status: String(x.compliance_status ?? ''),
        sanction_note: String(x.sanction_note ?? ''),
      });
    }
  }
  return {
    as_of: o.as_of != null ? String(o.as_of) : null,
    source: String(o.source ?? ''),
    rows,
  };
}

export function buildFreeFloatMap(rows: FreeFloatRow[]): Map<string, FreeFloatRow> {
  const m = new Map<string, FreeFloatRow>();
  rows.forEach((r) => {
    if (r.share_code) m.set(r.share_code, r);
  });
  return m;
}
