/**
 * Hand-rolled charts. Each has a text equivalent: a visible summary, and a
 * "Show as table" toggle that swaps the graphic for the numbers behind it.
 */
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { HeatCell, WeekBucket } from "@/lib/derive";
import { MIN_SAMPLE } from "@/lib/tenant-config";
import { pct, peakRuns, type Hotspot } from "@/lib/patterns";
import { TONE_FILL, dayLabel, fmt, hourLabel } from "./primitives";

function TableToggle({
  chart,
  table,
  label,
}: {
  chart: ReactNode;
  table: ReactNode;
  label: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="rounded-md border border-ink/20 px-2 py-0.5 text-[0.6875rem] text-ink/80 hover:bg-surface-2"
        >
          {asTable ? `Show ${label} as chart` : `Show ${label} as table`}
        </button>
      </div>
      {asTable ? <div className="overflow-x-auto">{table}</div> : chart}
    </div>
  );
}

// ─── Weekly trend ──────────────────────────────────────────────────────────

/**
 * Stacked weekly bars of friction + blocked responses. Bars share `max` when
 * given, so small multiples are on one scale.
 */
export function TrendBars({
  weeks,
  max,
  compact = false,
}: {
  weeks: WeekBucket[];
  max?: number;
  compact?: boolean;
}) {
  const top = max ?? Math.max(1, ...weeks.map((w) => w.friction + w.blocked));
  const height = compact ? 36 : 96;
  const chart = (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden="true">
        {weeks.map((w) => {
          const fH = (w.friction / top) * height;
          const bH = (w.blocked / top) * height;
          return (
            <div
              key={w.weekStart}
              className="flex flex-1 flex-col justify-end"
              title={`Week of ${dayLabel(w.weekStart)}: ${w.friction + w.blocked} of ${w.n} reported difficulty`}
            >
              <div className={`${TONE_FILL.blocked}`} style={{ height: bH }} />
              <div className={`${TONE_FILL.friction}`} style={{ height: fH }} />
              {w.n === 0 && <div className="h-px bg-ink/20" />}
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between text-[0.6875rem] text-ink/70">
          <span>w/c {dayLabel(weeks[0]?.weekStart ?? "")}</span>
          <span>w/c {dayLabel(weeks[weeks.length - 1]?.weekStart ?? "")}</span>
        </div>
      )}
    </div>
  );
  if (compact) return chart;
  return (
    <TableToggle
      label="trend"
      chart={
        <>
          {chart}
          <div className="mt-2 flex gap-4 text-[0.6875rem] text-ink/75">
            <Legend fill={TONE_FILL.friction} label="Some difficulty" />
            <Legend fill={TONE_FILL.blocked} label="Couldn't do it unaided" />
          </div>
        </>
      }
      table={
        <table className="w-full text-[0.8125rem]">
          <caption className="sr-only">Weekly responses reporting difficulty</caption>
          <thead>
            <tr className="bg-surface-2 text-left text-[0.6875rem] uppercase tracking-wider text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
              <th scope="col">Week of</th>
              <th scope="col" className="text-right">
                Some difficulty
              </th>
              <th scope="col" className="text-right">
                Couldn't unaided
              </th>
              <th scope="col" className="text-right">
                Responses
              </th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.weekStart} className="border-t border-ink/8">
                <th scope="row" className="py-1 text-left font-normal">
                  {dayLabel(w.weekStart)}
                </th>
                <td className="text-right tabular-nums">{w.friction}</td>
                <td className="text-right tabular-nums">{w.blocked}</td>
                <td className="text-right tabular-nums">{fmt(w.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

function Legend({ fill, label }: { fill: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block size-3 rounded-sm ring-1 ring-inset ring-black/25 ${fill}`} />
      {label}
    </span>
  );
}

// ─── Hour × weekday heatmap ────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 05:00–23:00

/**
 * Three bands, grey for "low" and the accent for "some" / "high", so the eye
 * lands on the hotspot. Exact counts are in each cell's tooltip and the table.
 */
const BANDS = [
  { upTo: 0.05, label: "Under 5% of answers", fill: "var(--grey-0)" },
  { upTo: 0.15, label: "5–15%", fill: "var(--tint-orange)" },
  { upTo: Infinity, label: "15%+", fill: "var(--data-reports)" },
];
function bandOf(share: number) {
  return BANDS.findIndex((b) => share < b.upTo);
}

export function Heatmap({
  cells,
  hotspot,
  compact = false,
}: {
  cells: HeatCell[][];
  hotspot?: Hotspot | null;
  compact?: boolean;
}) {
  const inSpot = (wd: number, h: number) =>
    !!hotspot && h >= hotspot.from && h < hotspot.to && (hotspot.weekdaysOnly ? wd < 5 : wd >= 5);
  const cellH = compact ? "h-3" : "h-6";
  const chart = (
    <div className={compact ? "" : "overflow-x-auto"}>
      <div
        className={`grid gap-[2px] ${compact ? "" : "min-w-[420px]"}`}
        style={{
          gridTemplateColumns: `${compact ? "1.75rem" : "2.5rem"} repeat(${HOURS.length}, minmax(0, 1fr))`,
        }}
        role="img"
        aria-label="Problem reports by weekday and hour. Outlined: the busiest three-hour band."
      >
        <span />
        {HOURS.map((h) => (
          <span key={h} className="text-center text-[0.625rem] tabular-nums text-ink/70">
            {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
          </span>
        ))}
        {DAYS.map((d, wd) => (
          <HeatRow
            key={d}
            day={d}
            wd={wd}
            row={cells[wd]}
            cellH={cellH}
            inSpot={inSpot}
            compact={compact}
          />
        ))}
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-ink/70">
          {BANDS.map((b) => (
            <span key={b.label} className="inline-flex items-center gap-1">
              <span
                className="inline-block size-3 rounded-sm ring-1 ring-inset ring-black/10"
                style={{ background: b.fill }}
              />
              {b.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="heat-thin inline-block size-3 rounded-sm ring-1 ring-inset ring-black/10" />
            Too few answers
          </span>
        </div>
      )}
    </div>
  );
  if (compact) return chart;
  return (
    <TableToggle
      label="heatmap"
      chart={chart}
      table={
        <table className="min-w-[640px] text-[0.75rem]">
          <caption className="sr-only">
            Answers reporting difficulty, of all answers, by weekday and hour
          </caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">
                Day
              </th>
              {HOURS.map((h) => (
                <th key={h} scope="col" className="px-1 text-right font-normal text-ink/70">
                  {String(h).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d, wd) => (
              <tr key={d} className="border-t border-ink/8">
                <th scope="row" className="text-left font-normal">
                  {d}
                </th>
                {HOURS.map((h) => {
                  const c = cells[wd][h];
                  return (
                    <td key={h} className="px-1 text-right tabular-nums">
                      {c.n ? `${c.difficulty}/${c.n}` : "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

function HeatRow({
  day,
  wd,
  row,
  cellH,
  inSpot,
  compact,
}: {
  day: string;
  wd: number;
  row: HeatCell[];
  cellH: string;
  inSpot: (wd: number, h: number) => boolean;
  compact: boolean;
}) {
  return (
    <>
      <span
        className={`pr-1 text-right text-[0.625rem] text-ink/70 ${compact ? "leading-3" : "leading-6 text-[0.6875rem]"}`}
      >
        {compact ? day[0] : day}
      </span>
      {HOURS.map((h) => {
        const c = row[h];
        const thin = c.n < MIN_SAMPLE;
        const band = bandOf(c.n ? c.difficulty / c.n : 0);
        return (
          <span
            key={h}
            title={
              c.n
                ? `${day} ${hourLabel(h)}: ${c.difficulty} of ${c.n} reported difficulty`
                : `${day} ${hourLabel(h)}: no answers`
            }
            className={`${cellH} rounded-[2px] ${thin && !compact ? "heat-thin" : ""} ${
              inSpot(wd, h) ? "outline-2 outline-offset-0 outline-ink" : ""
            }`}
            style={{
              // Too few answers: hatched in the full view, plain grey when compact.
              background: thin ? (compact ? "var(--grey-0)" : undefined) : BANDS[band].fill,
              outlineStyle: inSpot(wd, h) ? "solid" : undefined,
            }}
          />
        );
      })}
    </>
  );
}

/** One row of hour cells: grey, with the peak hours in the accent. */
export function HourStrip({ hours }: { hours: number[] }) {
  const runs = peakRuns(hours);
  const isPeak = (h: number) => runs.some(([a, b]) => h >= a && h < b);
  return (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${HOURS.length}, 1fr)` }}>
      {HOURS.map((h) => (
        <span
          key={h}
          title={`${hourLabel(h)}: ${hours[h]} reports`}
          className="h-3 rounded-[2px]"
          style={{
            background: isPeak(h)
              ? "var(--data-reports)"
              : hours[h] > 0
                ? "var(--grey-1)"
                : "var(--grey-0)",
          }}
        />
      ))}
    </div>
  );
}

// ─── Before / after ────────────────────────────────────────────────────────

/** Before vs after an intervention: a two-row table and weekly report bars. */
export function BeforeAfterChart({
  weekly,
  before,
  after,
  interventionDay,
}: {
  weekly: { weekStart: string; n: number; reports: number; after: boolean }[];
  before: { n: number; reports: number; days: number };
  after: { n: number; reports: number; days: number };
  interventionDay: string;
}) {
  const max = Math.max(1, ...weekly.map((w) => w.reports));
  const firstAfter = weekly.findIndex((w) => w.after);
  return (
    <div>
      <table className="w-full text-[0.8125rem]">
        <caption className="sr-only">Reports before and after the intervention</caption>
        <thead>
          <tr className="bg-surface-2 text-left text-[0.6875rem] uppercase tracking-wider text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
            <th scope="col" className="pb-1">
              Period
            </th>
            <th scope="col" className="pb-1 text-right">
              Days
            </th>
            <th scope="col" className="pb-1 text-right">
              Answers
            </th>
            <th scope="col" className="pb-1 text-right">
              Reports
            </th>
            <th scope="col" className="pb-1 text-right">
              Rate
            </th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["Before", before],
              ["After", after],
            ] as const
          ).map(([label, p]) => (
            <tr key={label} className="border-t border-ink/8">
              <th scope="row" className="py-1 text-left font-normal">
                {label}
              </th>
              <td className="text-right tabular-nums">{p.days}</td>
              <td className="text-right tabular-nums">{fmt(p.n)}</td>
              <td className="text-right tabular-nums">{p.reports}</td>
              <td className="text-right font-semibold tabular-nums">{pct(p.reports, p.n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="relative mt-3 flex h-10 items-end gap-[3px]" aria-hidden="true">
        {weekly.map((w, i) => (
          <div
            key={w.weekStart}
            title={`Week of ${dayLabel(w.weekStart)}: ${w.reports} of ${w.n}`}
            className={`flex-1 rounded-t-[2px] ${i === firstAfter ? "border-l-2 border-ink" : ""}`}
            style={{
              height: `${Math.max(2, (w.reports / max) * 40)}px`,
              background: w.after ? "var(--grey-1)" : "var(--grey-2)",
            }}
          />
        ))}
      </div>
      <p className="mt-1 text-[0.6875rem] text-ink/70">
        Weekly reports · intervention {dayLabel(interventionDay)} (line)
      </p>
    </div>
  );
}

// ─── Maps ──────────────────────────────────────────────────────────────────

type MapSite = {
  ref: string;
  label: string;
  lat: number | null;
  lng: number | null;
  attention: number;
  n: number;
};

/**
 * A schematic network map: sites placed by their coordinates on a plain
 * canvas. No tile server, so it works offline in a meeting room.
 */
export function NetworkMap({ sites }: { sites: MapSite[] }) {
  const placed = sites.filter((s) => s.lat != null && s.lng != null);
  if (placed.length === 0) return null;
  const lats = placed.map((s) => s.lat!);
  const lngs = placed.map((s) => s.lng!);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  // Longitude degrees shrink with latitude; correct so the layout isn't stretched.
  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = Math.max(1e-6, (maxLng - minLng) * k);
  const spanY = Math.max(1e-6, maxLat - minLat);
  const scale = Math.min(70 / spanX, 55 / spanY);
  const pos = (s: MapSite) => ({
    x: 50 + (s.lng! - (minLng + maxLng) / 2) * k * scale,
    // Nudged up: each marker's label hangs below it.
    y: 42 - (s.lat! - (minLat + maxLat) / 2) * scale,
  });
  return (
    <div className="relative h-72 w-full overflow-hidden rounded-xl bg-[var(--grey-0)]">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        {placed.slice(1).map((s) => {
          const a = pos(placed[0]);
          const b = pos(s);
          return (
            <line
              key={s.ref}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--grey-2)"
              strokeWidth="0.4"
              strokeDasharray="1 1"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      <ul>
        {placed.map((s) => {
          const p = pos(s);
          return (
            <li
              key={s.ref}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <Link
                to="/admin/locations/$ref"
                params={{ ref: s.ref }}
                search={true}
                className="flex flex-col items-center gap-1 rounded-lg p-1 text-center focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full border-2 text-[0.75rem] font-bold ${
                    s.attention > 0
                      ? "border-ink/25 bg-orange text-ink"
                      : "border-ink/25 bg-mint text-ink"
                  }`}
                >
                  {s.attention > 0 ? s.attention : "✓"}
                </span>
                <span className="max-w-32 rounded border border-line bg-surface px-1.5 py-0.5 text-[0.75rem] font-semibold leading-tight text-ink">
                  {s.label}
                  <span className="block text-[0.625rem] font-normal text-ink/70">
                    {s.attention > 0 ? `${s.attention} to look at` : "All clear"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type SchematicItem = {
  ref: string;
  label: string;
  sx: number | null;
  sy: number | null;
  n: number;
  difficulty: number;
};

/**
 * Children on the parent's plan, all grey except one that clearly stands out
 * (1.5× the typical rate). If nothing stands out, nothing is highlighted —
 * a highlight that means nothing is worse than none.
 */
export function Schematic({
  items,
  standoutRef,
}: {
  items: SchematicItem[];
  standoutRef: string | null;
}) {
  const placed = items.filter((i) => i.sx != null && i.sy != null);
  if (placed.length < 2) return null;
  const chip = (i: SchematicItem) => {
    const focus = i.ref === standoutRef;
    return (
      <Link
        to="/admin/locations/$ref"
        params={{ ref: i.ref }}
        search={true}
        title={`${i.label}: ${i.difficulty} of ${i.n} answers reported difficulty`}
        className={`block whitespace-nowrap rounded-md px-2.5 py-1.5 text-center text-[0.75rem] font-semibold ${
          focus ? "bg-orange text-ink" : "border border-line bg-surface text-ink/80"
        }`}
      >
        {i.label}
      </Link>
    );
  };
  // A single row (a line of stands) reads best as a simple wrapped row.
  if (new Set(placed.map((i) => i.sy)).size === 1) {
    return (
      <ul className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-[var(--grey-0)] p-5">
        {[...placed]
          .sort((a, b) => a.sx! - b.sx!)
          .map((i) => (
            <li key={i.ref}>{chip(i)}</li>
          ))}
      </ul>
    );
  }
  const fit = (vals: number[], lo: number, hi: number) => {
    const [min, max] = [Math.min(...vals), Math.max(...vals)];
    return (v: number) => (max === min ? 50 : lo + ((v - min) / (max - min)) * (hi - lo));
  };
  const fx = fit(
    placed.map((i) => i.sx!),
    12,
    88,
  );
  const fy = fit(
    placed.map((i) => i.sy!),
    20,
    80,
  );
  return (
    <div className="relative h-56 w-full overflow-hidden rounded-xl bg-[var(--grey-0)]">
      <ul>
        {placed.map((i) => (
          <li
            key={i.ref}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${fx(i.sx!)}%`, top: `${fy(i.sy!)}%` }}
          >
            {chip(i)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The child that clearly stands out from its siblings, if any. */
export function standoutChild<T extends { ref: string; n: number; difficulty: number }>(
  items: T[],
): T | null {
  const rated = items.filter((i) => i.n >= MIN_SAMPLE * 2);
  if (rated.length < 2) return null;
  const rates = rated.map((i) => i.difficulty / i.n).sort((a, b) => a - b);
  const median = rates[Math.floor(rates.length / 2)];
  const top = rated.reduce((a, b) => (b.difficulty / b.n > a.difficulty / a.n ? b : a));
  const topRate = top.difficulty / top.n;
  return topRate > 0 && topRate >= Math.max(median * 1.5, 0.02) ? top : null;
}
