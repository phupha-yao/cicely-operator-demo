/**
 * Load one organisation's whole frame — locations, question, responses,
 * exposure, context, issues — in one parallel pass, then let derive.ts reduce
 * it in memory. At demo scale (~12k responses) that is a few hundred ms, and
 * it keeps every view consistent with every other.
 *
 * Cached per process for a short TTL so moving between pages during a
 * walkthrough doesn't reload it each time.
 */
import type { AdminDb } from "./admin-auth.server";
import { fetchAllRows } from "./supabase-paging";
import { indexFrame, type Frame, type Index, type ScaleOption } from "./derive";
import { sectorConfig } from "./tenant-config";

const TTL_MS = 60_000;
let cached: { at: number; ix: Index } | null = null;

export async function loadIndex(db: AdminDb): Promise<Index> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ix;
  const frame = await loadFrame(db);
  const ix = indexFrame(frame, sectorConfig(frame.org.sector));
  cached = { at: Date.now(), ix };
  return ix;
}

/** Drop the cached frame after a write, so the next read sees it. */
export function invalidateIndex(): void {
  cached = null;
}

async function loadFrame(db: AdminDb): Promise<Frame> {
  // One organisation per deployment. DEMO_ORG_SLUG picks it when there are several.
  const slug = process.env.DEMO_ORG_SLUG;
  const orgQuery = db.from("organisations").select("id, name, sector").order("created_at");
  const { data: orgs, error: orgErr } = await (slug ? orgQuery.eq("slug", slug) : orgQuery).limit(
    1,
  );
  if (orgErr) throw new Error("Could not load organisation");
  const org = orgs?.[0];
  if (!org) throw new Error("No organisation found — run `npm run demo:generate`.");
  // The prospect's display name stays out of the database and the repo.
  const name = process.env.DEMO_ORG_NAME || org.name;

  const [locations, questions, responses, exposure, events, issues, weather, footfall, service] =
    await Promise.all([
      fetchAllRows(
        (from, to) =>
          db
            .from("locations")
            .select(
              "id, parent_id, level, ref, label, kind, lat, lng, schematic_x, schematic_y, sort",
            )
            .eq("org_id", org.id)
            .order("id")
            .range(from, to),
        "locations",
      ),
      db
        .from("questions")
        .select("id, code, version, wording, scale, active_from")
        .eq("org_id", org.id)
        .eq("is_primary", true)
        .order("version", { ascending: false })
        .limit(1),
      fetchAllRows(
        (from, to) =>
          db
            .from("responses")
            .select(
              "id, location_id, answered_at, value, segment, issue_category, severity, comment, respondent_key, after_dark, is_valid",
            )
            .eq("org_id", org.id)
            .order("id")
            .range(from, to),
        "responses",
      ),
      fetchAllRows(
        (from, to) =>
          db
            .from("exposure_daily")
            .select("location_id, day, count, locations!inner(org_id)")
            .eq("locations.org_id", org.id)
            .order("location_id")
            .order("day")
            .range(from, to),
        "exposure",
      ),
      fetchAllRows(
        (from, to) =>
          db
            .from("context_events")
            .select("id, location_id, kind, label, starts_at, ends_at")
            .eq("org_id", org.id)
            .order("id")
            .range(from, to),
        "context events",
      ),
      db
        .from("issues")
        .select(
          "id, location_id, category, title, status, owner, opened_at, intervention, intervention_at, resolved_at, notes",
        )
        .eq("org_id", org.id)
        .order("opened_at", { ascending: false }),
      fetchAllRows(
        (from, to) =>
          db
            .from("weather_hourly")
            .select("hour_start, temp_c, precip_mm, wind_kmh, is_dark")
            .eq("org_id", org.id)
            .order("hour_start")
            .range(from, to),
        "weather",
      ),
      fetchAllRows(
        (from, to) =>
          db
            .from("footfall_hourly")
            .select("location_id, hour_start, count, locations!inner(org_id)")
            .eq("locations.org_id", org.id)
            .order("location_id")
            .order("hour_start")
            .range(from, to),
        "footfall",
      ),
      fetchAllRows(
        (from, to) =>
          db
            .from("service_hourly")
            .select(
              "location_id, hour_start, buses_scheduled, buses_run, on_time, locations!inner(org_id)",
            )
            .eq("locations.org_id", org.id)
            .order("location_id")
            .order("hour_start")
            .range(from, to),
        "service",
      ),
    ]);
  if (questions.error || !questions.data?.[0])
    throw new Error("Could not load the primary question");
  if (issues.error) throw new Error("Could not load issues");
  const q = questions.data[0];

  return {
    org: { id: org.id, name, sector: org.sector },
    question: {
      id: q.id,
      code: q.code,
      version: q.version,
      wording: q.wording,
      scale: q.scale as unknown as ScaleOption[],
      activeFrom: q.active_from,
    },
    locations: locations.map((l) => ({
      id: l.id,
      parentId: l.parent_id,
      level: l.level,
      ref: l.ref,
      label: l.label,
      kind: l.kind,
      lat: l.lat,
      lng: l.lng,
      sx: l.schematic_x,
      sy: l.schematic_y,
      sort: l.sort,
    })),
    responses: responses.map((r) => ({
      id: r.id,
      locationId: r.location_id,
      at: r.answered_at,
      value: r.value,
      segment: r.segment,
      category: r.issue_category,
      severity: r.severity,
      comment: r.comment,
      respondentKey: r.respondent_key,
      afterDark: r.after_dark,
      valid: r.is_valid,
    })),
    exposure: exposure.map((e) => ({ locationId: e.location_id, day: e.day, count: e.count })),
    events: events.map((e) => ({
      id: e.id,
      locationId: e.location_id,
      kind: e.kind as "weather" | "disruption" | "works",
      label: e.label,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
    })),
    issues: issues.data.map((i) => ({
      id: i.id,
      locationId: i.location_id,
      category: i.category,
      title: i.title,
      status: i.status,
      owner: i.owner,
      openedAt: i.opened_at,
      intervention: i.intervention,
      interventionAt: i.intervention_at,
      resolvedAt: i.resolved_at,
      notes: i.notes,
    })),
    weather: weather.map((w) => ({
      hour: w.hour_start,
      tempC: w.temp_c,
      precipMm: w.precip_mm,
      windKmh: w.wind_kmh,
      isDark: w.is_dark,
    })),
    footfall: footfall.map((f) => ({
      locationId: f.location_id,
      hour: f.hour_start,
      count: f.count,
    })),
    service: service.map((v) => ({
      locationId: v.location_id,
      hour: v.hour_start,
      scheduled: v.buses_scheduled,
      run: v.buses_run,
      onTime: v.on_time,
    })),
    loadedAt: new Date().toISOString(),
  };
}
