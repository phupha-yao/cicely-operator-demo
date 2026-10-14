import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ScaleOption } from "@/lib/derive";
import type { Tone } from "@/lib/tenant-config";
import type { DashboardSearch } from "@/lib/filters";
import { hh } from "@/lib/patterns";
import { sectorConfig } from "@/lib/tenant-config";
import { StatusPill, TONE_FILL, dayLabel, fmt } from "./primitives";

// ─── Question ──────────────────────────────────────────────────────────────

/** The exact question asked, as one quiet line. */
export function AskedLine({
  question,
}: {
  question: { wording: string; version: number; activeFrom: string; scale: ScaleOption[] };
}) {
  return (
    <p className="text-[0.8125rem] text-ink/70">
      Question (v{question.version}):{" "}
      <span className="italic text-ink/80">“{question.wording}”</span>
    </p>
  );
}

// ─── Filters ───────────────────────────────────────────────────────────────

export type FilterOptions = {
  sites: { ref: string; label: string }[];
  problems: { id: string; label: string; n: number }[];
  segments: { id: string; n: number }[];
};

export function FilterBar({
  search,
  sector,
  options,
  showSite = true,
}: {
  search: DashboardSearch;
  sector: string;
  options: FilterOptions;
  showSite?: boolean;
}) {
  const navigate = useNavigate();
  const config = sectorConfig(sector);
  const set = (patch: Partial<DashboardSearch>) =>
    navigate({
      to: ".",
      search: (prev: DashboardSearch) => ({ ...prev, ...patch }),
      replace: true,
    });
  const weeks = search.weeks ?? 12;
  const select = (active: boolean) =>
    `h-8 rounded-lg bg-surface px-2.5 text-[0.8125rem] ${
      active ? "border-[1.5px] border-ink font-semibold" : "border border-line-strong"
    }`;
  const any = search.site || search.problem || search.segment || search.weeks;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showSite && (
        <select
          aria-label="Station"
          value={search.site ?? ""}
          onChange={(e) => set({ site: e.target.value || undefined })}
          className={select(!!search.site)}
        >
          <option value="">All {config.levels.site.many}</option>
          {options.sites.map((s) => (
            <option key={s.ref} value={s.ref}>
              {s.label}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Problem"
        value={search.problem ?? ""}
        onChange={(e) => set({ problem: e.target.value || undefined })}
        className={select(!!search.problem)}
      >
        <option value="">All problems</option>
        {options.problems.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} ({fmt(p.n)})
          </option>
        ))}
      </select>
      <select
        aria-label="Group"
        value={search.segment ?? ""}
        onChange={(e) => set({ segment: e.target.value || undefined })}
        className={select(!!search.segment)}
      >
        <option value="">All {config.respondent.many}</option>
        {config.segments.map((s) => {
          const n = options.segments.find((c) => c.id === s.id)?.n;
          return (
            <option key={s.id} value={s.id}>
              {s.label}
              {n != null ? ` (${fmt(n)})` : ""}
            </option>
          );
        })}
      </select>
      <div
        role="group"
        aria-label="Period"
        className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-surface p-0.5 text-[0.8125rem]"
      >
        {([4, 12] as const).map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={weeks === w}
            onClick={() => set({ weeks: w === 12 ? undefined : w })}
            className={`rounded-md px-2.5 py-0.5 ${
              weeks === w ? "bg-ink text-canvas" : "text-ink/75 hover:bg-surface-2"
            }`}
          >
            {w} wk
          </button>
        ))}
      </div>
      {any && (
        <button
          type="button"
          onClick={() => navigate({ to: ".", search: () => ({}), replace: true })}
          className="text-[0.75rem] text-ink/70 underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ─── Breadcrumbs ───────────────────────────────────────────────────────────

export function Breadcrumbs({ path }: { path: { ref: string; label: string }[] }) {
  return (
    <nav aria-label="Location" className="text-[0.8125rem] text-ink/70">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link to="/admin/locations" search={true} className="hover:underline">
            Network
          </Link>
        </li>
        {path.map((p, i) => (
          <li key={p.ref} className="flex items-center gap-1">
            <ChevronRight aria-hidden="true" className="size-3.5" />
            {i === path.length - 1 ? (
              <span aria-current="page" className="font-semibold text-ink">
                {p.label}
              </span>
            ) : (
              <Link
                to="/admin/locations/$ref"
                params={{ ref: p.ref }}
                search={true}
                className="hover:underline"
              >
                {p.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ─── Answers ───────────────────────────────────────────────────────────────

export type AnswerRowData = {
  id: string;
  day: string;
  hour: number;
  place: string;
  answer: string;
  tone: Tone;
  problem: string | null;
  severity: string | null;
  group: string | null;
  tempC: number | null;
  rainMm: number;
  cond: {
    rain: boolean;
    dark: boolean;
    disrupted: boolean;
    works: boolean;
    busy: boolean;
    late: boolean;
  };
  comment: string | null;
};

/** Individual answers, newest first — the raw records behind every figure. */
export function AnswersTable({ rows }: { rows: AnswerRowData[] }) {
  if (rows.length === 0) {
    return <p className="text-[0.8125rem] text-ink/70">No reports in this period.</p>;
  }
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[900px] text-[0.8125rem]">
        <caption className="sr-only">Recent problem reports</caption>
        <thead>
          <tr className="bg-surface-2 text-left text-[0.6875rem] uppercase tracking-wider text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
            <th scope="col" className="px-2 pb-2">
              Time
            </th>
            <th scope="col" className="px-2 pb-2">
              Where
            </th>
            <th scope="col" className="px-2 pb-2">
              Answer
            </th>
            <th scope="col" className="px-2 pb-2">
              Problem
            </th>
            <th scope="col" className="px-2 pb-2">
              Severity
            </th>
            <th scope="col" className="px-2 pb-2">
              Group
            </th>
            <th scope="col" className="px-2 pb-2">
              Conditions
            </th>
            <th scope="col" className="px-2 pb-2">
              Comment
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ink/8 align-top">
              <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                {dayLabel(r.day)} {hh(r.hour)}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5">{r.place}</td>
              <td className="whitespace-nowrap px-2 py-1.5">
                <span
                  className={`mr-1.5 inline-block size-2 rounded-full ${TONE_FILL[r.tone]}`}
                  aria-hidden="true"
                />
                {r.answer}
              </td>
              <td className="px-2 py-1.5">{r.problem ?? "–"}</td>
              <td className="px-2 py-1.5">{r.severity ?? "–"}</td>
              <td className="px-2 py-1.5">{r.group ?? "–"}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-[0.75rem] text-ink/75">
                {[
                  r.tempC != null ? `${r.tempC}°C` : null,
                  r.rainMm > 0 ? `${r.rainMm}mm` : null,
                  r.cond.dark ? "dark" : null,
                  r.cond.busy ? "busy" : null,
                  r.cond.late ? "late buses" : null,
                  r.cond.disrupted ? "disruption" : null,
                  r.cond.works ? "works" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </td>
              <td className="px-2 py-1.5 text-ink/80">{r.comment ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { StatusPill };

// ─── Page header ───────────────────────────────────────────────────────────

/** Every page's header: optional breadcrumb, title and meta line, filters on the right. */
export function PageHeader({
  title,
  kind,
  meta,
  crumbs,
  right,
}: {
  title: string;
  kind?: string;
  meta?: React.ReactNode;
  crumbs?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {crumbs}
        <h1 className={`font-display text-[1.375rem] leading-tight ${crumbs ? "mt-1" : ""}`}>
          {title}
          {kind && <span className="ml-2 font-sans text-[0.8125rem] text-ink/70">{kind}</span>}
        </h1>
        {meta && <div className="mt-1">{meta}</div>}
      </div>
      {right}
    </div>
  );
}
