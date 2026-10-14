import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { exportCsv, getMethod } from "@/lib/operator.functions";
import { sectorConfig } from "@/lib/tenant-config";
import { AskedLine, PageHeader } from "@/components/operator/panels";
import { Card, CategoryIcon, OfN, fmt } from "@/components/operator/primitives";

export const Route = createFileRoute("/_authenticated/admin/method")({
  component: Method,
});

function Method() {
  const search = Route.useSearch();
  const fn = useServerFn(getMethod);
  const q = useQuery({ queryKey: ["method"], queryFn: () => fn() });
  if (q.isError) return <p role="alert">Couldn't load: {String(q.error)}</p>;
  if (!q.data) return <p className="text-ink/70">Loading…</p>;
  const d = q.data;
  const config = sectorConfig(d.org.sector);

  return (
    <div className="space-y-6">
      <PageHeader title="Method and evidence" meta={<AskedLine question={d.question} />} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="data" title="The evidence">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.875rem]">
            <dt className="text-ink/70">Valid responses</dt>
            <dd>{fmt(d.total)}</dd>
            <dt className="text-ink/70">Excluded as invalid</dt>
            <dd>{fmt(d.invalid)}</dd>
            <dt className="text-ink/70">Stated an access need</dt>
            <dd>
              <OfN n={d.stated} of={d.total} strong={false} /> (optional)
            </dd>
            <dt className="text-ink/70">Locations</dt>
            <dd>
              {d.levels.site} {config.levels.site.many}, {d.levels.zone} {config.levels.zone.many},{" "}
              {d.levels.point} {config.levels.point.many}
            </dd>
            <dt className="text-ink/70">Context feeds</dt>
            <dd>
              {fmt(d.feeds.weather)} hours of weather (temperature, rain, wind, dark) ·{" "}
              {fmt(d.feeds.footfall)} station-hours of footfall · {fmt(d.feeds.service)}{" "}
              station-hours of bus service · {fmt(d.feeds.events)} disruption, works and weather
              events
            </dd>
            <dt className="text-ink/70">Exposure</dt>
            <dd>
              {fmt(d.evidence.exposure)} {config.exposure.many} in the last 12 weeks (daily counts
              per answer point)
            </dd>
          </dl>
        </Card>
        <Card id="rules" title="Rules the dashboard follows">
          <ul className="list-disc space-y-1.5 pl-5 text-[0.875rem] text-ink/90">
            <li>
              Rate = problem reports ÷ all answers at that location in the period. Hover any rate
              for its counts.
            </li>
            <li>
              A location × problem row is listed when 3+ different people report it at 2× the
              network rate or more, or when any report is severe enough to stop independent travel.
            </li>
            <li>
              Condition columns (▲): the problem&apos;s rate inside the condition ÷ outside it,
              shown when 1.5× or more with 3+ reports and 10+ answers inside. Busy = the
              station&apos;s busiest quarter of hours; late buses = under 80% on time in that hour.
            </li>
            <li>
              Fewer than {d.minSample} answers: faded or hatched, never hidden. Times are local.
            </li>
            <li>Conditions coincide with problems; they don&apos;t prove a cause.</li>
          </ul>
        </Card>
      </div>

      <Card id="taxonomy" title="Issue categories and severity">
        <div className="grid gap-6 md:grid-cols-3">
          <ul className="space-y-1 text-[0.8125rem]">
            {d.categories.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5">
                <CategoryIcon name={c.icon} className="size-3.5" />
                {c.label}
              </li>
            ))}
          </ul>
          <ol className="space-y-1 text-[0.8125rem]">
            {d.severities.map((s) => (
              <li key={s.id}>
                {s.rank}. {s.label}
              </li>
            ))}
          </ol>
          <ul className="space-y-1 text-[0.8125rem]">
            {d.segments.map((s) => (
              <li key={s.id}>{s.label}</li>
            ))}
          </ul>
        </div>
      </Card>

      <Card
        id="export"
        title="Export"
        sub="Every valid response in the current filter, one row each."
      >
        <ExportButton search={search} />
      </Card>
    </div>
  );
}

function ExportButton({ search }: { search: { weeks?: 4 | 12; segment?: string } }) {
  const fn = useServerFn(exportCsv);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const { csv, filename } = await fn({ data: search });
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="rounded-lg bg-ink px-4 py-2 text-[0.875rem] font-semibold text-surface disabled:opacity-60"
    >
      {busy ? "Preparing…" : "Download CSV"}
    </button>
  );
}
