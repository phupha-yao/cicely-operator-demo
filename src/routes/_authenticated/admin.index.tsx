import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getOverview } from "@/lib/operator.functions";
import { sectorConfig } from "@/lib/tenant-config";
import { AskedLine, FilterBar, PageHeader } from "@/components/operator/panels";
import { Card } from "@/components/operator/primitives";
import { KpiStrip, ProblemTable, StationTable } from "@/components/operator/tables";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Overview,
});

function Overview() {
  const search = Route.useSearch();
  const fn = useServerFn(getOverview);
  const q = useQuery({
    queryKey: ["overview", search],
    queryFn: () => fn({ data: search }),
    placeholderData: (prev) => prev,
  });
  if (q.isError) return <p role="alert">Couldn't load the overview: {String(q.error)}</p>;
  if (!q.data) return <p className="text-ink/70">Loading…</p>;
  const d = q.data;
  const config = sectorConfig(d.org.sector);
  const short = Object.fromEntries(config.categories.map((c) => [c.id, c.short]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        meta={<AskedLine question={d.question} />}
        right={<FilterBar search={search} sector={d.org.sector} options={d.filters} />}
      />

      <KpiStrip
        items={[
          { label: "Answers", value: d.kpis.answers },
          { label: "Riders", value: d.kpis.riders },
          { label: "Footfall", value: d.kpis.boardings },
          { label: "Problem reports", value: d.kpis.reports },
          { label: "Severe", value: d.kpis.severe },
          { label: "Open issues", value: d.kpis.openIssues },
        ]}
      />

      <Card
        id="problems"
        title="Problems by location"
        sub={`${d.problems.length} ${d.problems.length === 1 ? "row" : "rows"} · ${d.range.from} to ${d.range.to} · ▲ = more common in that condition`}
      >
        <ProblemTable rows={d.problems} shortLabels={short} />
      </Card>

      <Card id="stations" title={`By ${config.levels.site.one}`}>
        <StationTable rows={d.stations} />
      </Card>
    </div>
  );
}
