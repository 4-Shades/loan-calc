import { useSyncExternalStore } from "react";

/**
 * Chart palette: the first three slots of the validated categorical palette, in
 * fixed order (dataviz skill, references/palette.md). Validated with
 * validate_palette.js --pairs all against this app's surfaces (#ffffff light,
 * #0a0a0a dark): all checks pass; light slot 3 is 2.82:1 on white, so every
 * chart also has a text description and the schedule table as its table view.
 * Each series keeps its color whatever the loan type (color follows the entity).
 */
const LIGHT = {
  series: { principal: "#2a78d6", interest: "#eb6834", balance: "#1baf7a", fees: "#1baf7a" },
  surface: "#ffffff",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  textPrimary: "#0b0b0b",
  textSecondary: "#52514e",
};

const DARK: ChartTheme = {
  series: { principal: "#3987e5", interest: "#d95926", balance: "#199e70", fees: "#199e70" },
  surface: "#0a0a0a",
  grid: "#2c2c2a",
  axis: "#383835",
  muted: "#898781",
  textPrimary: "#f0efec",
  textSecondary: "#c3c2b7",
};

export type ChartTheme = typeof LIGHT;

const query = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

/** Light or dark chart colors, following the OS setting like the rest of the app. */
export function useChartTheme(): ChartTheme {
  const dark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
  return dark ? DARK : LIGHT;
}

const compact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Axis ticks: 12500 → "$12.5K". */
export function formatCompactUsd(dollars: number): string {
  return compact.format(dollars);
}
