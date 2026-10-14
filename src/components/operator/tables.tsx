/**
 * Structured tables for the operator surface. Every cell is a value or a small
 * mark; anything that needs explaining is in the cell's tooltip.
 */
import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CONDITIONS, type Condition, type ConditionLift, type ProblemRow } from "@/lib/derive";
import { hh, peakLabel, peakRuns, pct, ratio } from "@/lib/patterns";
import { CategoryIcon, StatusPill, fmt } from "./primitives";

// ─── KPIs ──────────────────────────────────────────────────────────────────

export function KpiStrip({ items }: { items: { label: string; value: number | string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {items.map((i) => (
        <div key={i.label} className="bg-surface px-4 py-3">
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wider text-ink/70">
            {i.label}
          </dt>
          <dd className="mt-1 font-display text-[1.375rem] leading-none tabular-nums text-ink">
            {typeof i.value === "number" ? fmt(i.value) : i.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Cells ─────────────────────────────────────────────────────────────────

/** "▲ 2.8×" when the problem is clearly more common in this condition; "–" otherwise. */
export function ContextCell({ lift, label }: { lift: ConditionLift | null; label: string }) {
  if (!lift) return <span className="text-ink/40">–</span>;
  return (
    <span
      title={`${label}: ${lift.inReports} of ${lift.inAnswers} answers reported it, vs ${lift.outReports} of ${lift.outAnswers} otherwise`}
      className="inline-flex items-center whitespace-nowrap rounded bg-dandelion px-1.5 py-0.5 text-[0.75rem] font-semibold tabular-nums text-ink"
    >
      ▲ {ratio(lift.ratio)}
    </span>
  );
}

const STRIP_HOURS = Array.from({ length: 19 }, (_, i) => i + 5);

/** 05–23h in 19 tiny cells; peak hours filled. */
export function MiniHours({ hours }: { hours: number[] }) {
  const runs = peakRuns(hours);
  const peak = (h: number) => runs.some(([a, b]) => h >= a && h < b);
  return (
    <span
      className="inline-grid gap-px align-middle"
      style={{ gridTemplateColumns: `repeat(${STRIP_HOURS.length}, 4px)` }}
      title={`Reports by hour: ${STRIP_HOURS.filter((h) => hours[h] > 0)
        .map((h) => `${hh(h)} ${hours[h]}`)
        .join(", ")}`}
      aria-label={`Peak ${peakLabel(hours)}`}
      role="img"
    >
      {STRIP_HOURS.map((h) => (
        <span
          key={h}
          className="h-3.5 rounded-[1px]"
          style={{
            background: peak(h)
              ? "var(--data-reports)"
              : hours[h] > 0
                ? "var(--grey-1)"
                : "var(--grey-0)",
          }}
        />
      ))}
    </span>
  );
}

// ─── Problems table ────────────────────────────────────────────────────────

type SortKey = "default" | "location" | "problem" | "reports" | "rate" | Condition;

const COND_HEAD: Record<Condition, string> = {
  rain: "Rain",
  dark: "Dark",
  disrupted: "Disrupt.",
  works: "Works",
  busy: "Busy",
  late: "Late buses",
};

/**
 * One row per location × problem. Location links to that location's page,
 * filtered to the problem. Sortable; default order is severity-weighted.
 */
export function ProblemTable({
  rows,
  showSite = true,
  shortLabels,
}: {
  rows: ProblemRow[];
  showSite?: boolean;
  shortLabels: Record<string, string>;
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "default",
    desc: true,
  });
  const sorted = useMemo(() => {
    if (sort.key === "default") return rows;
    const val = (r: ProblemRow): number | string => {
      switch (sort.key) {
        case "location":
          return r.location.path.join(" ");
        case "problem":
          return r.category.label;
        case "reports":
          return r.reports;
        case "rate":
          return r.rate;
        default:
          return r.context[sort.key as Condition]?.ratio ?? 0;
      }
    };
    return [...rows].sort((a, b) => {
      const x = val(a),
        y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
      return sort.desc ? -c : c;
    });
  }, [rows, sort]);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-[0.875rem] text-ink/70">No rows match these filters.</p>
    );
  }

  const head = (
    key: SortKey,
    label: string,
    align: "left" | "right" | "center" = "left",
    title?: string,
  ) => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
        className={`whitespace-nowrap px-2 pb-2 font-semibold text-${align}`}
      >
        <button
          type="button"
          title={title}
          onClick={() =>
            setSort((s) =>
              s.key === key
                ? { key, desc: !s.desc }
                : { key, desc: key !== "location" && key !== "problem" },
            )
          }
          className={`inline-flex items-center gap-0.5 uppercase tracking-wider hover:text-ink ${
            active ? "text-ink" : ""
          }`}
        >
          {label}
          {active &&
            (sort.desc ? (
              <ArrowDown className="size-3" aria-hidden="true" />
            ) : (
              <ArrowUp className="size-3" aria-hidden="true" />
            ))}
        </button>
      </th>
    );
  };

  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[1080px] text-[0.8125rem]">
        <caption className="sr-only">Problems by location</caption>
        <thead>
          <tr className="bg-surface-2 text-[0.6875rem] text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
            {head("location", "Location")}
            {head("problem", "Problem")}
            <th
              scope="col"
              className="px-2 pb-2 text-left font-semibold uppercase tracking-wider"
              title="Reports by hour, 05:00–23:00"
            >
              When
            </th>
            <th
              scope="col"
              className="px-2 pb-2 text-left font-semibold uppercase tracking-wider"
              title="Access-need group behind most reports"
            >
              Group
            </th>
            {head("reports", "Reports", "right")}
            {head("rate", "Rate", "right", "Reports ÷ all answers at this location")}
            {CONDITIONS.map((c) => (
              <Fragment key={c.id}>
                {head(c.id, COND_HEAD[c.id], "center", `${c.inside} vs ${c.outside.toLowerCase()}`)}
              </Fragment>
            ))}
            <th scope="col" className="px-2 pb-2 text-left font-semibold uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const site = r.location.path[0];
            return (
              <tr key={r.key} className="border-t border-ink/8 hover:bg-surface-2/60">
                <th scope="row" className="min-w-[11rem] px-2 py-2 text-left font-normal">
                  <Link
                    to="/admin/locations/$ref"
                    params={{ ref: r.location.ref }}
                    search={(prev: Record<string, unknown>) => ({
                      ...prev,
                      problem: r.category.id,
                    })}
                    className="font-semibold text-ink hover:underline"
                  >
                    {r.location.label}
                  </Link>
                  {showSite && r.location.label !== site && (
                    <span className="block text-[0.75rem] text-ink/70">{site}</span>
                  )}
                </th>
                <td className="px-2 py-2">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <CategoryIcon name={r.category.icon} className="size-3.5 shrink-0" />
                    {shortLabels[r.category.id] ?? r.category.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-2">
                  <MiniHours hours={r.hours} />
                  <span className="ml-2 text-[0.6875rem] text-ink/70">
                    {r.weekdayShare >= 0.85
                      ? "Mon–Fri"
                      : r.weekdayShare <= 0.15
                        ? "Sat–Sun"
                        : "All week"}
                  </span>
                </td>
                <td className="max-w-[10rem] px-2 py-2">
                  {r.group ? (
                    <span
                      className="block text-[0.75rem] leading-tight"
                      title={`${r.group.reports} of ${r.group.of} people in this group who answered here reported it`}
                    >
                      {r.group.label}
                      <span className="block tabular-nums text-ink/70">
                        {r.group.reports} of {r.group.of} people
                      </span>
                    </span>
                  ) : (
                    <span className="text-ink/40">–</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">{r.reports}</td>
                <td
                  className="px-2 py-2 text-right tabular-nums"
                  title={`${r.reports} of ${r.answers} answers, from ${r.people} people`}
                >
                  {pct(r.reports, r.answers)}
                </td>
                {CONDITIONS.map((c) => (
                  <td key={c.id} className="px-2 py-2 text-center">
                    <ContextCell lift={r.context[c.id]} label={c.inside} />
                  </td>
                ))}
                <td className="px-2 py-2">
                  {r.issue ? <StatusPill status={r.issue.status} /> : <StatusPill status="new" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Stations table ────────────────────────────────────────────────────────

export type StationRow = {
  ref: string;
  label: string;
  kind: string;
  answers: number;
  reports: number;
  boardings: number;
  problems: number;
  last7: number;
  prev7: number;
};

export function StationTable({ rows }: { rows: StationRow[] }) {
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[640px] text-[0.8125rem]">
        <caption className="sr-only">Stations</caption>
        <thead>
          <tr className="bg-surface-2 text-left text-[0.6875rem] uppercase tracking-wider text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
            <th scope="col" className="px-2 pb-2">
              Station
            </th>
            <th scope="col" className="px-2 pb-2 text-right">
              Answers
            </th>
            <th scope="col" className="px-2 pb-2 text-right">
              Reports
            </th>
            <th scope="col" className="px-2 pb-2 text-right">
              Rate
            </th>
            <th scope="col" className="px-2 pb-2 text-right">
              Boardings
            </th>
            <th scope="col" className="px-2 pb-2 text-right">
              Problems listed
            </th>
            <th
              scope="col"
              className="px-2 pb-2 text-right"
              title="Reports in the last 7 days vs the 7 before"
            >
              Last 7d / prev 7d
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.ref} className="border-t border-ink/8">
              <th scope="row" className="px-2 py-2 text-left font-normal">
                <Link
                  to="/admin/locations/$ref"
                  params={{ ref: s.ref }}
                  search={true}
                  className="font-semibold text-ink hover:underline"
                >
                  {s.label}
                </Link>
                <span className="ml-2 text-[0.75rem] text-ink/70">{s.kind}</span>
              </th>
              <td className="px-2 py-2 text-right tabular-nums">{fmt(s.answers)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmt(s.reports)}</td>
              <td
                className="px-2 py-2 text-right tabular-nums"
                title={`${s.reports} of ${s.answers}`}
              >
                {pct(s.reports, s.answers)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{fmt(s.boardings)}</td>
              <td className="px-2 py-2 text-right tabular-nums">
                {s.problems > 0 ? (
                  <span className="rounded bg-orange px-1.5 py-0.5 font-semibold text-ink">
                    {s.problems}
                  </span>
                ) : (
                  "0"
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {s.last7} / {s.prev7}
                <span className="ml-1 inline-block w-3 text-ink/70" aria-hidden="true">
                  {s.last7 > s.prev7 ? "↑" : s.last7 < s.prev7 ? "↓" : ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
