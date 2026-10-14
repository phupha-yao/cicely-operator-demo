import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getLocation } from "@/lib/operator.functions";
import { hotspot, pct } from "@/lib/patterns";
import { MIN_SAMPLE, sectorConfig } from "@/lib/tenant-config";
import { BeforeAfterChart, Heatmap } from "@/components/operator/charts";
import {
  AnswersTable,
  AskedLine,
  Breadcrumbs,
  FilterBar,
  PageHeader,
} from "@/components/operator/panels";
import {
  Card,
  CategoryIcon,
  SplitTable,
  StatusPill,
  dayLabel,
  fmt,
} from "@/components/operator/primitives";
import { KpiStrip, ProblemTable } from "@/components/operator/tables";
import { ContextTimeline } from "@/components/operator/timeline";

export const Route = createFileRoute("/_authenticated/admin/locations/$ref")({
  component: LocationPage,
});

function LocationPage() {
  const { ref } = Route.useParams();
  const search = Route.useSearch();
  const fn = useServerFn(getLocation);
  const q = useQuery({
    queryKey: ["location", ref, search],
    queryFn: () => fn({ data: { ref, ...search } }),
    placeholderData: (prev) => (prev?.node.ref === ref ? prev : undefined),
  });
  if (q.isError) return <p role="alert">Couldn't load this location: {String(q.error)}</p>;
  if (!q.data) return <p className="text-ink/70">Loading…</p>;
  const d = q.data;
  const config = sectorConfig(d.org.sector);
  const short = Object.fromEntries(config.categories.map((c) => [c.id, c.short]));
  const problemLabel = search.problem
    ? (config.categories.find((c) => c.id === search.problem)?.label ?? search.problem)
    : null;
  const childNoun = d.children[0] ? config.levels[d.children[0].level] : null;
  const reportsLabel = problemLabel ? `${problemLabel} reports` : "Problem reports";

  return (
    <div className="space-y-5">
      <PageHeader
        title={d.node.label}
        kind={d.node.kind}
        crumbs={<Breadcrumbs path={d.path} />}
        meta={<AskedLine question={d.question} />}
        right={
          <FilterBar search={search} sector={d.org.sector} options={d.filters} showSite={false} />
        }
      />

      <KpiStrip
        items={[
          { label: "Answers", value: d.facts.answers },
          { label: reportsLabel, value: d.facts.reports },
          { label: "Report rate", value: pct(d.facts.reports, d.facts.answers) },
          { label: "People reporting", value: d.facts.people },
          { label: "Station footfall", value: d.facts.boardings },
          { label: "Open issues", value: d.facts.openIssues },
        ]}
      />

      <Card id="problems" title="Problems here" sub="▲ = more common in that condition">
        <ProblemTable rows={d.problems} shortLabels={short} showSite={false} />
      </Card>

      <Card
        id="timeline"
        title="Daily"
        sub={`${reportsLabel} with weather, footfall and bus service · ${d.range.from} to ${d.range.to}`}
      >
        <ContextTimeline series={d.series} />
      </Card>

      <div className={`grid gap-5 ${childNoun ? "lg:grid-cols-[1.4fr_1fr]" : ""}`}>
        <Card
          id="week"
          title="Hour × weekday"
          sub={`${reportsLabel} · outline = busiest 3-hour band`}
        >
          <Heatmap cells={d.heatmap.cells} hotspot={hotspot(d.heatmap.cells)} />
        </Card>
        {childNoun && (
          <Card id="children" title={`By ${childNoun.one}`}>
            <table className="w-full text-[0.8125rem]">
              <caption className="sr-only">{`Each ${childNoun.one}`}</caption>
              <thead>
                <tr className="bg-surface-2 text-left text-[0.6875rem] uppercase tracking-wider text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
                  <th scope="col" className="pb-1.5 capitalize">
                    {childNoun.one}
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
                  <th scope="col" className="pb-1.5 pl-3">
                    Top problem
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.children.map((c) => (
                  <tr
                    key={c.ref}
                    className={`border-t border-ink/8 ${c.n < MIN_SAMPLE ? "opacity-60" : ""}`}
                  >
                    <th scope="row" className="py-1.5 text-left font-normal">
                      <Link
                        to="/admin/locations/$ref"
                        params={{ ref: c.ref }}
                        search={true}
                        className="font-semibold hover:underline"
                      >
                        {c.label}
                      </Link>
                    </th>
                    <td className="text-right tabular-nums">{fmt(c.n)}</td>
                    <td className="text-right tabular-nums">{c.difficulty}</td>
                    <td className="text-right tabular-nums">{pct(c.difficulty, c.n)}</td>
                    <td className="pl-3">
                      {c.topProblem ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CategoryIcon name={c.topProblem.icon} className="size-3.5" />
                          {short[c.topProblem.id] ?? c.topProblem.label}
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card id="groups" title="By group" sub="All problems · self-declared access need">
          <SplitTable
            rows={d.groups}
            caption="Reports by access-need group"
            minSample={MIN_SAMPLE}
          />
        </Card>
        <Card id="issues" title="Issues">
          {d.issues.length === 0 ? (
            <p className="text-[0.8125rem] text-ink/70">
              None logged.{" "}
              <Link to="/admin/issues" search={true} className="underline">
                Assign an owner
              </Link>
            </p>
          ) : (
            <ul className="space-y-5">
              {d.issues.map((i) => (
                <li key={i.id}>
                  <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
                    <StatusPill status={i.status} />
                    <span className="font-semibold text-ink">{i.title}</span>
                  </div>
                  <dl className="mt-1 grid grid-cols-[6rem_1fr] gap-x-3 text-[0.8125rem] text-ink/80">
                    <dt className="text-ink/70">Owner</dt>
                    <dd>{i.owner ?? "–"}</dd>
                    <dt className="text-ink/70">Opened</dt>
                    <dd>{dayLabel(i.openedAt.slice(0, 10))}</dd>
                    {i.intervention && (
                      <>
                        <dt className="text-ink/70">Action</dt>
                        <dd>{i.intervention}</dd>
                      </>
                    )}
                  </dl>
                  {i.beforeAfter && (
                    <div className="mt-2">
                      <BeforeAfterChart {...i.beforeAfter} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        id="answers"
        title="Recent reports"
        sub="Latest 25 · individual answers with the conditions at the time"
      >
        <AnswersTable rows={d.answers} />
      </Card>
    </div>
  );
}
