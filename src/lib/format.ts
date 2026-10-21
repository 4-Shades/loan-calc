const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** 43871 → "$438.71" */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** 92.219 → "92.22%" */
export function formatPercent(percent: number): string {
  return `${percent.toFixed(2)}%`;
}
