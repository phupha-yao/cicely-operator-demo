import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getContext } from "@/lib/operator.functions";
import { hotspot, pct } from "@/lib/patterns";
import { Heatmap } from "@/components/operator/charts";
import { AskedLine, FilterBar, PageHeader } from "@/components/operator/panels";
import { Caveat, Card, dayLabel, fmt } from "@/components/operator/primitives";
import { ContextTimeline } from "@/components/operator/timeline";

export const Route = createFileRoute("/_authenticated/admin/context")({
  component: ContextPage,
});

function ContextPage() {
  const search = Route.useSearch();
  const fn = useServerFn(getContext);
  const q = useQuery({
    queryKey: ["context", search],
    queryFn: () => fn({ data: search }),
    placeholderData: (prev) => prev,
  });
  if (q.isError) return <p role="alert">Couldn't load context: {String(q.error)}</p>;
  if (!q.data) return <p className="text-ink/70">Loading…</p>;
  const d = q.data;
  const maxPerSite = Math.max(1, ...d.perSite.flatMap((s) => s.series.map((p) => p.reports)));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Context"
        meta={<AskedLine question={d.question} />}
        right={<FilterBar search={search} sector={d.org.sector} options={d.filters} />}
      />

      <Card
        id="timeline"
        title="Daily"
        sub={`Problem reports with weather, footfall and bus service · ${d.range.from} to ${d.range.to}`}
      >
        <ContextTimeline series={d.series} />
      </Card>

      <Card id="per-site" title="Daily reports by station" sub="Same scale on every row">
        <div className="grid grid-cols-[10rem_1fr_3rem] items-center gap-x-3 gap-y-2">
          {d.perSite.map((s) => {
            const total = s.series.reduce((n, p) => n + p.reports, 0);
            return (
              <div key={s.ref} className="contents">
                <span className="text-right text-[0.8125rem] font-semibold text-ink">
                  {s.label}
                </span>
                <svg
                  viewBox={`0 0 ${s.series.length} 28`}
                  preserveAspectRatio="none"
                  className="h-7 w-full"
                  role="img"
                  aria-label={`${s.label}: ${total} reports`}
                >
                  <rect width={s.series.length} height="28" fill="var(--grey-0)" />
                  {s.series.map((p, i) =>
                    p.reports ? (
                      <rect
                        key={p.day}
                        x={i + 0.1}
                        width="0.8"
                        y={28 - (p.reports / maxPerSite) * 27}
                        height={(p.reports / maxPerSite) * 27}
                        fill="var(--data-reports)"
                      >
                        <title>{`${dayLabel(p.day)}: ${p.reports} of ${p.answers}`}</title>
                      </rect>
                    ) : null,
                  )}
                </svg>
                <span className="text-[0.75rem] tabular-nums text-ink/70">{total}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card id="conditions" title="Conditions" sub="Report rate inside vs outside each condition">
          <table className="w-full text-[0.8125rem]">
            <caption className="sr-only">Report rate by condition</caption>
            <thead>
              <tr className="bg-surface-2 text-left text-[0.6875rem] uppercase tracking-wider text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
                <th scope="col" className="pb-1.5">
                  Condition
                </th>
                <th scope="col" className="pb-1.5 text-right">
                  Answers
                </th>
                <th scope="col" className="pb-1.5 text-right">
                  Reports
                </th>
                <th scope="col" className="pb-1.5 text-right">
                  Rate
                </th>
                <th scope="col" className="pb-1.5 text-right">
                  Otherwise
                </th>
              </tr>
            </thead>
            <tbody>
              {d.conditions.map((c) => (
                <tr key={c.id} className="border-t border-ink/8">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    <span className="font-semibold">{c.label}</span>
                    <span className="block text-[0.6875rem] text-ink/70">{c.inside.label}</span>
                  </th>
                  <td className="text-right tabular-nums">{fmt(c.inside.answers)}</td>
                  <td className="text-right tabular-nums">{fmt(c.inside.reports)}</td>
                  <td className="text-right font-semibold tabular-nums">
                    {pct(c.inside.reports, c.inside.answers)}
                  </td>
                  <td
                    className="text-right tabular-nums text-ink/70"
                    title={`${c.outside.reports} of ${c.outside.answers}`}
                  >
                    {pct(c.outside.reports, c.outside.answers)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Caveat>Coincidence, not cause.</Caveat>
        </Card>
        <Card
          id="week"
          title="Hour × weekday"
          sub="Problem reports · outline = busiest 3-hour band"
        >
          <Heatmap cells={d.heatmap.cells} hotspot={hotspot(d.heatmap.cells)} />
        </Card>
      </div>

      <Card id="events" title="Disruption and works" sub={`${d.events.length} in the period`}>
        <table className="w-full text-[0.8125rem]">
          <caption className="sr-only">Disruption and works</caption>
          <thead>
            <tr className="bg-surface-2 text-left text-[0.6875rem] uppercase tracking-wider text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
              <th scope="col" className="pb-1.5">
                Type
              </th>
              <th scope="col" className="pb-1.5">
                Event
              </th>
              <th scope="col" className="pb-1.5">
                Where
              </th>
              <th scope="col" className="pb-1.5">
                From
              </th>
              <th scope="col" className="pb-1.5">
                To
              </th>
            </tr>
          </thead>
          <tbody>
            {d.events.map((e) => (
              <tr key={e.id} className="border-t border-ink/8">
                <td className="py-1.5 capitalize">{e.kind}</td>
                <td>{e.label}</td>
                <td>{e.where}</td>
                <td className="tabular-nums">{dayLabel(e.startDay)}</td>
                <td className="tabular-nums">{dayLabel(e.endDay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
