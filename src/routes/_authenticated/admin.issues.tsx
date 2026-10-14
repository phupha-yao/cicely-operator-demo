import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { listIssues, logIssue } from "@/lib/operator.functions";
import type { ProblemRow } from "@/lib/derive";
import { pct } from "@/lib/patterns";
import { sectorConfig } from "@/lib/tenant-config";
import { Card, CategoryIcon, StatusPill, dayLabel } from "@/components/operator/primitives";
import { PageHeader } from "@/components/operator/panels";
import { ContextCell } from "@/components/operator/tables";
import { CONDITIONS } from "@/lib/derive";

export const Route = createFileRoute("/_authenticated/admin/issues")({
  component: Issues,
});

const STEPS = ["Detect", "Investigate", "Assign", "Intervene", "Remeasure"];

function Issues() {
  const fn = useServerFn(listIssues);
  const q = useQuery({ queryKey: ["issues"], queryFn: () => fn() });
  if (q.isError) return <p role="alert">Couldn't load issues: {String(q.error)}</p>;
  if (!q.data) return <p className="text-ink/70">Loading…</p>;
  const d = q.data;
  const config = sectorConfig(d.org.sector);
  const short = Object.fromEntries(config.categories.map((c) => [c.id, c.short]));
  const open = d.issues.filter((i) => i.status !== "resolved");
  const resolved = d.issues.filter((i) => i.status === "resolved");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Issues"
        meta={
          <ol
            className="mt-2 flex flex-wrap items-center gap-1 text-[0.75rem] text-ink/70"
            aria-label="Steps"
          >
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-1">
                <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-ink">
                  {s}
                </span>
                {i < STEPS.length - 1 && <span aria-hidden="true">→</span>}
              </li>
            ))}
          </ol>
        }
      />

      <Card
        id="detected"
        title="Detected, no owner"
        sub={`Last ${d.attentionWindowDays} days · ${d.detected.length} ${d.detected.length === 1 ? "row" : "rows"}`}
      >
        <DetectedTable rows={d.detected} short={short} />
      </Card>

      <Card id="open" title="Open" sub={`${open.length} ${open.length === 1 ? "row" : "rows"}`}>
        <IssueTable issues={open} short={short} />
      </Card>
      <Card
        id="resolved"
        title="Resolved"
        sub={`${resolved.length} ${resolved.length === 1 ? "row" : "rows"} · before/after rates measured on the same location and problem`}
      >
        <IssueTable issues={resolved} short={short} />
      </Card>
    </div>
  );
}

function DetectedTable({ rows, short }: { rows: ProblemRow[]; short: Record<string, string> }) {
  const [assigning, setAssigning] = useState<string | null>(null);
  if (rows.length === 0) return <p className="text-[0.8125rem] text-ink/70">None.</p>;
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[860px] text-[0.8125rem]">
        <caption className="sr-only">Detected problems with no owner</caption>
        <thead>
          <tr className="bg-surface-2 text-left text-[0.6875rem] uppercase tracking-wider text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
            <th scope="col" className="px-2 pb-2">
              Location
            </th>
            <th scope="col" className="px-2 pb-2">
              Problem
            </th>
            <th scope="col" className="px-2 pb-2">
              Group
            </th>
            <th scope="col" className="px-2 pb-2 text-right">
              Reports
            </th>
            <th scope="col" className="px-2 pb-2 text-right">
              Rate
            </th>
            <th scope="col" className="px-2 pb-2">
              Worst severity
            </th>
            <th scope="col" className="px-2 pb-2">
              Conditions
            </th>
            <th scope="col" className="px-2 pb-2">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.key}>
              <tr className="border-t border-ink/8">
                <th scope="row" className="px-2 py-2 text-left font-normal">
                  <Link
                    to="/admin/locations/$ref"
                    params={{ ref: r.location.ref }}
                    search={{ problem: r.category.id }}
                    className="font-semibold hover:underline"
                  >
                    {r.location.label}
                  </Link>
                  <span className="block text-[0.75rem] text-ink/70">{r.location.path[0]}</span>
                </th>
                <td className="px-2 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <CategoryIcon name={r.category.icon} className="size-3.5" />
                    {short[r.category.id] ?? r.category.label}
                  </span>
                </td>
                <td className="px-2 py-2">
                  {r.group ? `${r.group.label} · ${r.group.reports}/${r.group.of}` : "–"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.reports}</td>
                <td
                  className="px-2 py-2 text-right tabular-nums"
                  title={`${r.reports} of ${r.answers}`}
                >
                  {pct(r.reports, r.answers)}
                </td>
                <td className="px-2 py-2">{r.worst?.label ?? "–"}</td>
                <td className="px-2 py-2">
                  <span className="flex flex-wrap gap-1">
                    {CONDITIONS.filter((c) => r.context[c.id]).map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1 text-[0.75rem]">
                        {c.label} <ContextCell lift={r.context[c.id]} label={c.inside} />
                      </span>
                    ))}
                    {CONDITIONS.every((c) => !r.context[c.id]) && (
                      <span className="text-ink/40">–</span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setAssigning(assigning === r.key ? null : r.key)}
                    aria-expanded={assigning === r.key}
                    className="whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-[0.75rem] font-semibold text-surface"
                  >
                    Assign owner
                  </button>
                </td>
              </tr>
              {assigning === r.key && (
                <tr>
                  <td colSpan={8} className="px-2 pb-3">
                    <AssignForm item={r} onDone={() => setAssigning(null)} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssignForm({ item, onDone }: { item: ProblemRow; onDone: () => void }) {
  const [owner, setOwner] = useState("");
  const [title, setTitle] = useState(`${item.category.label} — ${item.location.label}`);
  const qc = useQueryClient();
  const fn = useServerFn(logIssue);
  const m = useMutation({
    mutationFn: () =>
      fn({ data: { ref: item.location.ref, category: item.category.id, title, owner } }),
    onSuccess: () => {
      toast.success("Issue logged", { description: owner });
      onDone();
      void qc.invalidateQueries();
    },
    onError: (e) => toast.error("Couldn't log it", { description: String(e) }),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
      className="grid gap-2 rounded-xl border border-ink/15 p-3 sm:grid-cols-[1fr_1fr_auto]"
    >
      <label className="text-[0.75rem] text-ink/80">
        Issue
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-[0.8125rem]"
        />
      </label>
      <label className="text-[0.75rem] text-ink/80">
        Owner
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          required
          minLength={2}
          autoFocus
          placeholder="Team or person"
          className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-[0.8125rem]"
        />
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          disabled={m.isPending}
          className="rounded-lg bg-ink px-3 py-1.5 text-[0.8125rem] font-semibold text-surface disabled:opacity-60"
        >
          {m.isPending ? "Saving…" : "Log issue"}
        </button>
        <button type="button" onClick={onDone} className="text-[0.8125rem] underline">
          Cancel
        </button>
      </div>
    </form>
  );
}

type IssueRow = Awaited<ReturnType<typeof listIssues>>["issues"][number];

function IssueTable({ issues, short }: { issues: IssueRow[]; short: Record<string, string> }) {
  if (issues.length === 0) return <p className="text-[0.8125rem] text-ink/70">None.</p>;
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[900px] text-[0.8125rem]">
        <caption className="sr-only">Issues</caption>
        <thead>
          <tr className="bg-surface-2 text-left text-[0.6875rem] uppercase tracking-wider text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
            <th scope="col" className="px-2 pb-2">
              Status
            </th>
            <th scope="col" className="px-2 pb-2">
              Location
            </th>
            <th scope="col" className="px-2 pb-2">
              Problem
            </th>
            <th scope="col" className="px-2 pb-2">
              Owner
            </th>
            <th scope="col" className="px-2 pb-2">
              Opened
            </th>
            <th scope="col" className="px-2 pb-2">
              Action
            </th>
            <th scope="col" className="px-2 pb-2 text-right">
              Before
            </th>
            <th scope="col" className="px-2 pb-2 text-right">
              After
            </th>
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => {
            const ba = i.beforeAfter;
            return (
              <tr key={i.id} className="border-t border-ink/8 align-top">
                <td className="px-2 py-2">
                  <StatusPill status={i.status} />
                </td>
                <td className="px-2 py-2">
                  <Link
                    to="/admin/locations/$ref"
                    params={{ ref: i.location.ref }}
                    search={{ problem: i.category }}
                    className="font-semibold hover:underline"
                  >
                    {i.location.label}
                  </Link>
                  <span className="block text-[0.75rem] text-ink/70">{i.location.path[0]}</span>
                </td>
                <td className="px-2 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <CategoryIcon name={i.categoryIcon} className="size-3.5" />
                    {short[i.category] ?? i.categoryLabel}
                  </span>
                </td>
                <td className="px-2 py-2">{i.owner ?? "–"}</td>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                  {dayLabel(i.openedAt.slice(0, 10))}
                </td>
                <td className="px-2 py-2 text-ink/80">{i.intervention ?? i.notes ?? "–"}</td>
                <td
                  className="px-2 py-2 text-right tabular-nums"
                  title={
                    ba
                      ? `${ba.before.reports} of ${ba.before.n}, ${ba.before.days} days`
                      : undefined
                  }
                >
                  {ba ? pct(ba.before.reports, ba.before.n) : "–"}
                </td>
                <td
                  className="px-2 py-2 text-right font-semibold tabular-nums"
                  title={
                    ba ? `${ba.after.reports} of ${ba.after.n}, ${ba.after.days} days` : undefined
                  }
                >
                  {ba ? pct(ba.after.reports, ba.after.n) : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
