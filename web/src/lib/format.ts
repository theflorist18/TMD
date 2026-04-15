const fmt = new Intl.NumberFormat('en-US');

export function formatInt(n: number) {
  return fmt.format(n);
}

export function formatPct(v: number) {
  return `${v.toFixed(2)}%`;
}

export function esc(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
