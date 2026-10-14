import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getOverview } from "@/lib/operator.functions";
import { sectorConfig } from "@/lib/tenant-config";
import { NetworkMap } from "@/components/operator/charts";
import { FilterBar, PageHeader } from "@/components/operator/panels";
import { Card } from "@/components/operator/primitives";
import { StationTable } from "@/components/operator/tables";

export const Route = createFileRoute("/_authenticated/admin/locations/")({
  component: Locations,
});

function Locations() {
  const search = Route.useSearch();
  const fn = useServerFn(getOverview);
  const q = useQuery({
    queryKey: ["overview", search],
    queryFn: () => fn({ data: search }),
    placeholderData: (prev) => prev,
  });
  if (q.isError) return <p role="alert">Couldn't load locations: {String(q.error)}</p>;
  if (!q.data) return <p className="text-ink/70">Loading…</p>;
  const d = q.data;
  const config = sectorConfig(d.org.sector);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Locations"
        right={
          <FilterBar search={search} sector={d.org.sector} options={d.filters} showSite={false} />
        }
      />
      <Card id="map" title="Map" sub="Number = problems listed at that station">
        <NetworkMap
          sites={d.stations.map((s) => ({
            ref: s.ref,
            label: s.label,
            lat: s.lat,
            lng: s.lng,
            attention: s.problems,
            n: s.answers,
          }))}
        />
      </Card>
      <Card id="stations" title={`All ${config.levels.site.many}`}>
        <StationTable rows={d.stations} />
      </Card>
    </div>
  );
}
