/**
 * Daily timeline: problem reports on top, operational and environmental lanes
 * underneath, all on one shared day axis so they can be read against each
 * other. Each lane is labelled with its unit and range; each day has a tooltip.
 */
import { Fragment, useState } from "react";
import type { DayPoint } from "@/lib/derive";
import { dayLabel, fmt } from "./primitives";

type Lane = {
  key: string;
  label: string;
  unit: string;
  kind: "bar" | "line" | "flag";
  value: (d: DayPoint) => number | null;
  color: string;
  /** Fixed range for lines that need one (on-time %). */
  domain?: [number, number];
  format?: (v: number) => string;
  height?: number;
};

const LANES: Lane[] = [
  {
    key: "reports",
    label: "Problem reports",
    unit: "per day",
    kind: "bar",
    value: (d) => d.reports,
    color: "var(--data-reports)",
    height: 64,
  },
  {
    key: "rain",
    label: "Rain",
    unit: "mm",
    kind: "bar",
    value: (d) => d.rainMm,
    color: "var(--data-rain)",
  },
  {
    key: "temp",
    label: "Max temp",
    unit: "°C",
    kind: "line",
    value: (d) => d.tempMax,
    color: "var(--data-temp)",
  },
  {
    key: "boardings",
    label: "Footfall",
    unit: "people",
    kind: "bar",
    value: (d) => d.boardings,
    color: "var(--data-footfall)",
    format: (v) => fmt(Math.round(v)),
  },
  {
    key: "ontime",
    label: "Buses on time",
    unit: "%",
    kind: "line",
    value: (d) => (d.onTime == null ? null : d.onTime * 100),
    color: "var(--data-ontime)",
    domain: [50, 100],
    format: (v) => `${Math.round(v)}`,
  },
  {
    key: "disruption",
    label: "Disruption",
    unit: "",
    kind: "flag",
    value: (d) => (d.disruption ? 1 : 0),
    color: "var(--data-disruption)",
    height: 12,
  },
  {
    key: "works",
    label: "Works",
    unit: "",
    kind: "flag",
    value: (d) => (d.works ? 1 : 0),
    color: "var(--data-works)",
    height: 12,
  },
];

const W = 1000;

export function ContextTimeline({ series }: { series: DayPoint[] }) {
  const [asTable, setAsTable] = useState(false);
  if (series.length === 0) return null;
  const n = series.length;
  const x = (i: number) => (i / n) * W;
  const bw = W / n;
  const ticks = series
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => new Date(`${d.day}T12:00:00Z`).getUTCDay() === 1);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="rounded-md border border-ink/20 px-2 py-0.5 text-[0.6875rem] text-ink/80 hover:bg-surface-2"
        >
          {asTable ? "Show as chart" : "Show as table"}
        </button>
      </div>
      {asTable ? (
        <TimelineTable series={series} />
      ) : (
        <div className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-x-3 gap-y-1.5">
          {LANES.map((lane) => {
            const values = series.map(lane.value);
            const present = values.filter((v): v is number => v != null);
            const [lo, hi] = lane.domain ?? [
              lane.kind === "line" ? Math.min(...present) : 0,
              Math.max(1, ...present),
            ];
            const h = lane.height ?? 36;
            const y = (v: number) => h - ((v - lo) / Math.max(1e-6, hi - lo)) * (h - 2) - 1;
            const fmtV = lane.format ?? ((v: number) => `${Math.round(v * 10) / 10}`);
            return (
              <Fragment key={lane.key}>
                <div className="text-right text-[0.75rem] leading-tight">
                  <span className="font-semibold text-ink">{lane.label}</span>
                  {lane.unit && (
                    <span className="block text-[0.6875rem] text-ink/70">{lane.unit}</span>
                  )}
                </div>
                <svg
                  viewBox={`0 0 ${W} ${h}`}
                  preserveAspectRatio="none"
                  className="w-full"
                  style={{ height: h }}
                  role="img"
                  aria-label={`${lane.label} by day`}
                >
                  <rect x="0" y="0" width={W} height={h} fill="var(--surface-2)" />
                  {ticks.map(({ i }) => (
                    <line
                      key={i}
                      x1={x(i)}
                      x2={x(i)}
                      y1="0"
                      y2={h}
                      stroke="var(--canvas)"
                      strokeWidth="2"
                    />
                  ))}
                  {lane.kind === "line" ? (
                    <polyline
                      fill="none"
                      stroke={lane.color}
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      points={values
                        .map((v, i) => (v == null ? null : `${x(i) + bw / 2},${y(v)}`))
                        .filter(Boolean)
                        .join(" ")}
                    />
                  ) : (
                    values.map((v, i) =>
                      v ? (
                        <rect
                          key={i}
                          x={x(i) + bw * 0.12}
                          width={bw * 0.76}
                          y={lane.kind === "flag" ? 0 : y(v)}
                          height={lane.kind === "flag" ? h : h - y(v)}
                          fill={lane.color}
                        >
                          <title>{`${dayLabel(series[i].day)}: ${lane.kind === "flag" ? lane.label : `${fmtV(v)} ${lane.unit}`}`}</title>
                        </rect>
                      ) : null,
                    )
                  )}
                </svg>
                <div className="text-[0.6875rem] tabular-nums text-ink/70">
                  {lane.kind === "flag"
                    ? `${present.filter((v) => v > 0).length} d`
                    : `max ${fmtV(hi)}`}
                </div>
              </Fragment>
            );
          })}
          <div />
          <div className="relative h-4 text-[0.625rem] text-ink/70">
            {ticks
              .filter((_, k) => k % 2 === 0)
              .map(({ d, i }) => (
                <span
                  key={d.day}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${(x(i) / W) * 100}%` }}
                >
                  {dayLabel(d.day)}
                </span>
              ))}
          </div>
          <div />
        </div>
      )}
    </div>
  );
}

function TimelineTable({ series }: { series: DayPoint[] }) {
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-[0.75rem]">
        <caption className="sr-only">
          Daily problem reports with weather, footfall and service
        </caption>
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-ink/70">
            <th scope="col">Day</th>
            <th scope="col" className="text-right">
              Reports
            </th>
            <th scope="col" className="text-right">
              Answers
            </th>
            <th scope="col" className="text-right">
              Rain mm
            </th>
            <th scope="col" className="text-right">
              Max °C
            </th>
            <th scope="col" className="text-right">
              Footfall
            </th>
            <th scope="col" className="text-right">
              On time %
            </th>
            <th scope="col">Disruption</th>
            <th scope="col">Works</th>
          </tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.day} className="border-t border-ink/8">
              <th scope="row" className="text-left font-normal">
                {dayLabel(d.day)}
              </th>
              <td className="text-right tabular-nums">{d.reports}</td>
              <td className="text-right tabular-nums">{d.answers}</td>
              <td className="text-right tabular-nums">{d.rainMm}</td>
              <td className="text-right tabular-nums">{d.tempMax ?? "–"}</td>
              <td className="text-right tabular-nums">{fmt(d.boardings)}</td>
              <td className="text-right tabular-nums">
                {d.onTime == null ? "–" : Math.round(d.onTime * 100)}
              </td>
              <td>{d.disruption ? "Yes" : ""}</td>
              <td>{d.works ? "Yes" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
