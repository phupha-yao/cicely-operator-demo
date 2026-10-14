/**
 * Operator dashboard server functions. Each one: admin gate → cached frame →
 * pure derivation in derive.ts → plain, serialisable rows and series. No
 * prose: the pages lay the data out and the operator reads it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addDays,
  attentionQueue,
  beforeAfter,
  breadcrumb,
  conditionTable,
  dailySeries,
  distinctPeople,
  evidence,
  heatmap,
  localTime,
  problemRows,
  rangeOf,
  segmentSplit,
  select,
  summarise,
  type Index,
  type Range,
  type Row,
} from "./derive";
import { ATTENTION_WINDOW_DAYS, MIN_SAMPLE, labelOf, severityOf } from "./tenant-config";

const filtersSchema = z.object({
  segment: z.string().max(40).optional(),
  weeks: z.number().int().min(1).max(52).optional(),
  site: z.string().max(80).optional(),
  problem: z.string().max(40).optional(),
});
type OperatorFilters = z.infer<typeof filtersSchema>;

function rangeFor(ix: Index, f: OperatorFilters): Range {
  return rangeOf(ix, {}, (f.weeks ?? 12) * 7);
}

async function indexFor(userId: string): Promise<Index> {
  const { adminDb } = await import("./admin-auth.server");
  const { loadIndex } = await import("./frame.server");
  return loadIndex(await adminDb(userId));
}

function header(ix: Index, filters: OperatorFilters) {
  return {
    org: ix.frame.org,
    question: {
      wording: ix.frame.question.wording,
      version: ix.frame.question.version,
      activeFrom: ix.frame.question.activeFrom,
      scale: ix.frame.question.scale,
    },
    range: rangeFor(ix, filters),
    today: ix.today,
  };
}

/** Options for the filter dropdowns, with counts in the current period. */
function filterOptions(ix: Index, range: Range) {
  const rows = select(ix, { range });
  const cats = new Map<string, number>();
  for (const r of rows)
    if (r.tone !== "clear" && r.category) cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
  return {
    sites: (ix.children.get(null) ?? []).map((s) => ({ ref: s.ref, label: s.label })),
    problems: ix.config.categories
      .filter((c) => cats.has(c.id))
      .map((c) => ({ id: c.id, label: c.label, n: cats.get(c.id)! })),
    segments: segmentSplit(ix, rows).map((s) => ({ id: s.id, n: s.n })),
  };
}

/** Footfall through the given sites in a range. */
function boardings(ix: Index, siteIds: Set<string>, range: Range): number {
  let n = 0;
  for (const f of ix.frame.footfall) {
    if (!siteIds.has(f.locationId)) continue;
    const d = localTime(f.hour).day;
    if (d >= range.from && d <= range.to) n += f.count;
  }
  return n;
}

function answerRow(ix: Index, r: Row) {
  const path = breadcrumb(ix, r.locationId);
  const w = ix.weatherByHour.get(new Date(r.at).toISOString().slice(0, 13));
  return {
    id: r.id,
    day: r.day,
    hour: r.hour,
    place:
      path
        .slice(1)
        .map((l) => l.label)
        .join(" › ") || path[0].label,
    answer: ix.frame.question.scale.find((o) => o.id === r.value)?.label ?? r.value,
    tone: r.tone,
    problem: r.category ? labelOf(ix.config.categories, r.category) : null,
    severity: severityOf(r.severity)?.label ?? null,
    group: r.segment ? labelOf(ix.config.segments, r.segment) : null,
    tempC: w ? Math.round(w.tempC) : null,
    rainMm: w?.precipMm ?? 0,
    cond: r.cond,
    comment: r.comment,
  };
}

function issueView(ix: Index, id: string) {
  const i = ix.frame.issues.find((x) => x.id === id)!;
  const loc = ix.byId.get(i.locationId)!;
  return {
    ...i,
    location: { ref: loc.ref, label: loc.label, path: breadcrumb(ix, loc.id).map((l) => l.label) },
    categoryLabel: labelOf(ix.config.categories, i.category),
    categoryIcon: ix.config.categories.find((c) => c.id === i.category)?.icon ?? "circle",
    beforeAfter: beforeAfter(ix, i),
  };
}

// ─── Shell ─────────────────────────────────────────────────────────────────

export const getShell = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ix = await indexFor(context.userId);
    return {
      org: ix.frame.org,
      sectorLabel: ix.config.name,
      /** Last day with data — shown as data freshness in the app bar. */
      dataTo: ix.today,
      /** Unowned problems in the attention window — the Issues tab badge. */
      unowned: attentionQueue(ix, {}).filter((a) => !a.issue).length,
    };
  });

// ─── Overview ──────────────────────────────────────────────────────────────

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filtersSchema.parse(d ?? {}))
  .handler(async ({ data: filters, context }) => {
    const ix = await indexFor(context.userId);
    const h = header(ix, filters);
    const site = filters.site ? ix.byRef.get(filters.site) : undefined;
    const rows = select(ix, { range: h.range, segment: filters.segment, locationId: site?.id });
    const sum = summarise(ix, rows);
    const problems = problemRows(ix, {
      range: h.range,
      segment: filters.segment,
      category: filters.problem,
      within: site?.id,
    });

    const sites = ix.children.get(null) ?? [];
    const last7 = { from: addDays(h.range.to, -6), to: h.range.to };
    const prev7 = { from: addDays(h.range.to, -13), to: addDays(h.range.to, -7) };
    const reportsIn = (siteId: string, range: Range) =>
      select(ix, { range, locationId: siteId, segment: filters.segment }).filter(
        (r) => r.tone !== "clear" && (!filters.problem || r.category === filters.problem),
      ).length;
    const stations = sites.map((s) => {
      const sr = select(ix, { range: h.range, locationId: s.id, segment: filters.segment });
      const reports = sr.filter(
        (r) => r.tone !== "clear" && (!filters.problem || r.category === filters.problem),
      ).length;
      return {
        ref: s.ref,
        label: s.label,
        kind: ix.config.kinds[s.kind] ?? s.kind,
        lat: s.lat,
        lng: s.lng,
        answers: sr.length,
        reports,
        boardings: boardings(ix, new Set([s.id]), h.range),
        problems: problems.filter(
          (p) => p.location.path[0] === s.label && p.issue?.status !== "resolved",
        ).length,
        last7: reportsIn(s.id, last7),
        prev7: reportsIn(s.id, prev7),
      };
    });

    return {
      ...h,
      filters: filterOptions(ix, h.range),
      kpis: {
        answers: sum.n,
        riders: sum.people,
        boardings: boardings(ix, new Set(site ? [site.id] : sites.map((s) => s.id)), h.range),
        reports: sum.difficulty,
        severe: sum.severe,
        openIssues: ix.frame.issues.filter((i) => i.status !== "resolved").length,
      },
      problems,
      stations,
    };
  });

// ─── Location (any level) ──────────────────────────────────────────────────

export const getLocation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filtersSchema.extend({ ref: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const ix = await indexFor(context.userId);
    const node = ix.byRef.get(data.ref);
    if (!node) throw new Error("Location not found");
    const h = header(ix, data);
    const scope = ix.subtree.get(node.id)!;
    const rows = select(ix, { range: h.range, locationId: node.id, segment: data.segment });
    const isReport = (r: Row) =>
      r.tone !== "clear" && (!data.problem || r.category === data.problem);
    const reports = rows.filter(isReport);
    const siteId = ix.siteOf.get(node.id)!;

    const children = (ix.children.get(node.id) ?? []).map((c) => {
      const cr = rows.filter((r) => ix.subtree.get(c.id)!.has(r.locationId));
      const sum = summarise(ix, cr);
      return {
        ref: c.ref,
        label: c.label,
        level: c.level,
        kind: ix.config.kinds[c.kind] ?? c.kind,
        sx: c.sx,
        sy: c.sy,
        n: cr.length,
        difficulty: cr.filter(isReport).length,
        topProblem: sum.categories[0] ?? null,
      };
    });

    const groups = segmentSplit(ix, select(ix, { range: h.range, locationId: node.id })).map(
      (g) => ({ ...g }),
    );

    return {
      ...h,
      filters: filterOptions(ix, h.range),
      node: {
        ref: node.ref,
        label: node.label,
        level: node.level,
        kind: ix.config.kinds[node.kind] ?? node.kind,
      },
      path: breadcrumb(ix, node.id).map((l) => ({ ref: l.ref, label: l.label })),
      facts: {
        answers: rows.length,
        reports: reports.length,
        people: distinctPeople(reports),
        boardings: boardings(ix, new Set([siteId]), h.range),
        openIssues: ix.frame.issues.filter(
          (i) => scope.has(i.locationId) && i.status !== "resolved",
        ).length,
        evidence: evidence(ix, rows, h.range, node.id),
      },
      problems: problemRows(ix, {
        range: h.range,
        segment: data.segment,
        category: data.problem,
        within: node.id,
      }),
      series: dailySeries(ix, {
        range: h.range,
        locationId: node.id,
        category: data.problem,
        segment: data.segment,
      }),
      heatmap: heatmap(rows, isReport),
      children,
      groups,
      answers: reports
        .slice()
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 25)
        .map((r) => answerRow(ix, r)),
      issues: ix.frame.issues
        .filter((i) => scope.has(i.locationId) && (!data.problem || i.category === data.problem))
        .map((i) => issueView(ix, i.id)),
    };
  });

// ─── Context ───────────────────────────────────────────────────────────────

export const getContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filtersSchema.parse(d ?? {}))
  .handler(async ({ data: filters, context }) => {
    const ix = await indexFor(context.userId);
    const h = header(ix, filters);
    const site = filters.site ? ix.byRef.get(filters.site) : undefined;
    const rows = select(ix, { range: h.range, segment: filters.segment, locationId: site?.id });
    const isReport = (r: Row) =>
      r.tone !== "clear" && (!filters.problem || r.category === filters.problem);
    return {
      ...h,
      filters: filterOptions(ix, h.range),
      series: dailySeries(ix, {
        range: h.range,
        locationId: site?.id,
        category: filters.problem,
        segment: filters.segment,
      }),
      perSite: (ix.children.get(null) ?? [])
        .filter((s) => !site || s.id === site.id)
        .map((s) => ({
          ref: s.ref,
          label: s.label,
          series: dailySeries(ix, {
            range: h.range,
            locationId: s.id,
            category: filters.problem,
            segment: filters.segment,
          }).map((d) => ({ day: d.day, reports: d.reports, answers: d.answers })),
        })),
      conditions: conditionTable(rows.map((r) => ({ ...r, tone: isReport(r) ? r.tone : "clear" }))),
      heatmap: heatmap(rows, isReport),
      events: ix.frame.events
        .filter((e) => e.kind !== "weather")
        .filter((e) => {
          const d = localTime(e.startsAt).day;
          return d >= h.range.from && d <= h.range.to;
        })
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          label: e.label,
          where: e.locationId ? ix.byId.get(e.locationId)!.label : "Network",
          startDay: localTime(e.startsAt).day,
          endDay: localTime(e.endsAt).day,
        })),
    };
  });

// ─── Issues ────────────────────────────────────────────────────────────────

export const listIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ix = await indexFor(context.userId);
    return {
      ...header(ix, {}),
      issues: ix.frame.issues.map((i) => issueView(ix, i.id)),
      detected: attentionQueue(ix, {}).filter((a) => !a.issue),
      attentionWindowDays: ATTENTION_WINDOW_DAYS,
    };
  });

// ─── Method and export ─────────────────────────────────────────────────────

export const getMethod = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ix = await indexFor(context.userId);
    const h = header(ix, {});
    const levels = { site: 0, zone: 0, point: 0 };
    for (const l of ix.frame.locations) levels[l.level]++;
    return {
      ...h,
      evidence: evidence(ix, select(ix, { range: h.range }), h.range),
      invalid: ix.frame.responses.filter((r) => !r.valid).length,
      stated: ix.rows.filter((r) => r.segment).length,
      total: ix.rows.length,
      levels,
      feeds: {
        weather: ix.frame.weather.length,
        footfall: ix.frame.footfall.length,
        service: ix.frame.service.length,
        events: ix.frame.events.length,
      },
      minSample: MIN_SAMPLE,
      attentionWindowDays: ATTENTION_WINDOW_DAYS,
      segments: ix.config.segments,
      categories: ix.config.categories,
      severities: ix.config.severities,
    };
  });

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const exportCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filtersSchema.parse(d ?? {}))
  .handler(async ({ data: filters, context }) => {
    const ix = await indexFor(context.userId);
    const range = rangeFor(ix, filters);
    const site = filters.site ? ix.byRef.get(filters.site) : undefined;
    const rows = select(ix, { range, segment: filters.segment, locationId: site?.id }).filter(
      (r) => !filters.problem || r.category === filters.problem,
    );
    const head = [
      "local_date",
      "local_hour",
      "site",
      "area",
      "point",
      "question_version",
      "answer",
      "segment",
      "issue_category",
      "severity",
      "temp_c",
      "rain_mm",
      "dark",
      "busy",
      "buses_late",
      "disruption",
      "works",
      "comment",
    ];
    const lines = rows.map((r) => {
      const path = breadcrumb(ix, r.locationId);
      const w = ix.weatherByHour.get(new Date(r.at).toISOString().slice(0, 13));
      return [
        r.day,
        r.hour,
        path[0]?.label,
        path[1]?.label,
        path[2]?.label,
        ix.frame.question.version,
        r.value,
        r.segment,
        r.category,
        r.severity,
        w?.tempC,
        w?.precipMm,
        r.cond.dark,
        r.cond.busy,
        r.cond.late,
        r.cond.disrupted,
        r.cond.works,
        r.comment,
      ]
        .map(csvCell)
        .join(",");
    });
    return {
      filename: `${ix.frame.org.name.replace(/\W+/g, "-").toLowerCase()}-${range.from}-to-${range.to}.csv`,
      csv: [head.join(","), ...lines].join("\n"),
    };
  });

// ─── Closing the loop ──────────────────────────────────────────────────────

/** Log a detected problem as an issue with an owner — the dashboard's only write. */
export const logIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ref: z.string().min(1).max(80),
        category: z.string().min(1).max(40),
        title: z.string().trim().min(3).max(200),
        owner: z.string().trim().min(2).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ix = await indexFor(context.userId);
    const loc = ix.byRef.get(data.ref);
    if (!loc) throw new Error("Location not found");
    if (!ix.config.categories.some((c) => c.id === data.category))
      throw new Error("Unknown category");
    const { adminDb } = await import("./admin-auth.server");
    const db = await adminDb(context.userId);
    const { error } = await db.from("issues").insert({
      org_id: ix.frame.org.id,
      location_id: loc.id,
      category: data.category,
      title: data.title,
      owner: data.owner,
      status: "investigating",
      opened_at: new Date().toISOString(),
    });
    if (error) throw new Error("Could not log the issue");
    const { invalidateIndex } = await import("./frame.server");
    invalidateIndex();
    return { ok: true as const };
  });
