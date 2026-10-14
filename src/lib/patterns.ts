/**
 * Small, pure helpers for displaying structured data: time bands and number
 * formats. No sentences — the dashboard shows the data and the operator reads it.
 */
import type { HeatCell } from "./derive.ts";

export const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** "4.8%" — always shown with its counts in a tooltip or alongside. */
export function pct(n: number, of: number): string {
  if (of <= 0) return "–";
  const v = (n / of) * 100;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
}

/** "2.8×", or "only" when nothing happens outside the condition. */
export function ratio(r: number): string {
  if (!Number.isFinite(r)) return "only";
  return `${r < 10 ? r.toFixed(1) : Math.round(r)}×`;
}

export type Hotspot = {
  from: number;
  to: number;
  weekdaysOnly: boolean;
  reports: number;
  n: number;
};

/**
 * The three-hour band with the most reported difficulty, on weekdays or at
 * weekends — used only to outline cells on a heatmap.
 */
export function hotspot(cells: HeatCell[][]): Hotspot | null {
  let best: Hotspot | null = null;
  for (const weekdaysOnly of [true, false]) {
    const days = weekdaysOnly ? [0, 1, 2, 3, 4] : [5, 6];
    for (let h = 5; h <= 21; h++) {
      let reports = 0,
        n = 0;
      for (const d of days) {
        for (let k = h; k < h + 3; k++) {
          reports += cells[d][k].difficulty;
          n += cells[d][k].n;
        }
      }
      if (!best || reports > best.reports) best = { from: h, to: h + 3, weekdaysOnly, reports, n };
    }
  }
  return best && best.reports >= 3 ? best : null;
}

/** Contiguous runs of hours at or near the peak: [[7, 9], [16, 18]]. */
export function peakRuns(hours: number[]): [number, number][] {
  const max = Math.max(...hours);
  if (max <= 0) return [];
  const runs: [number, number][] = [];
  for (let h = 0; h < 24; h++) {
    if (hours[h] < max * 0.75) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] === h) last[1] = h + 1;
    else runs.push([h, h + 1]);
  }
  return runs;
}

/** "16–19h" / "07–09h, 16–18h" — a compact label, not a sentence. */
export function peakLabel(hours: number[]): string {
  const runs = peakRuns(hours);
  if (runs.length === 0) return "–";
  if (runs.length > 2) return "spread";
  return runs
    .map(([a, b]) => `${String(a).padStart(2, "0")}–${String(b).padStart(2, "0")}h`)
    .join(", ");
}
