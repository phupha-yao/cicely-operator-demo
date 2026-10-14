/**
 * Write the bus-franchise demo (scripts/demo-story.ts) to Supabase.
 *
 *   npm run demo:generate -- --dry-run      # build in memory, print the story checks
 *   npm run demo:generate                    # write to the Supabase project in .env
 *
 * Optional env: DEMO_ORG_NAME (the prospect's name — local only, never commit
 * it), DEMO_CENTRE="lat,lng" (where the network sits on the map), DEMO_SEED.
 */
import { createClient } from "@supabase/supabase-js";
import {
  attentionQueue,
  beforeAfter,
  indexFrame,
  summarise,
  select,
  rangeOf,
} from "../src/lib/derive.ts";
import { sectorConfig } from "../src/lib/tenant-config.ts";
import { buildDemo } from "./demo-story.ts";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const ORG_SLUG = "demo-bus";
const PROD_REFS = ["mdyvohehemmlyzioafwx"]; // the InPost study's live project

const frame = buildDemo({
  seed: process.env.DEMO_SEED ? Number(process.env.DEMO_SEED) : undefined,
  name: process.env.DEMO_ORG_NAME || undefined,
  centre: process.env.DEMO_CENTRE
    ? (process.env.DEMO_CENTRE.split(",").map(Number) as [number, number])
    : undefined,
});
const { org, question, locations, responses, exposure, events, issues } = frame;
const ORG_NAME = org.name;

const ix = indexFrame(frame, sectorConfig("bus"));
const all = summarise(ix, select(ix, { range: rangeOf(ix, {}) }));
const queue = attentionQueue(ix, {});
console.log(
  `Organisation: ${ORG_NAME} · ${locations.length} locations · ${responses.length} responses · ${exposure.length} exposure rows · ${events.length} events`,
);
console.log(
  `Network: ${all.clear} of ${all.n} "yes, easily"; ${all.difficulty} reported difficulty; ${all.severe} severe`,
);
console.log("Needs attention (last 28 days):");
for (const [i, a] of queue.slice(0, 6).entries()) {
  console.log(
    `  ${i + 1}. ${a.location.path.join(" › ")} — ${a.category.label}: ${a.reports} reports, ${a.people} people, worst ${a.worst?.label}${a.issue ? ` [${a.issue.status}]` : ""}`,
  );
  const ctx = Object.entries(a.context)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v!.ratio === Infinity ? "only" : `${v!.ratio.toFixed(1)}x`}`);
  console.log(
    `       group ${a.group?.label ?? "-"} · peak ${a.hours.indexOf(Math.max(...a.hours))}:00 · ${ctx.join(", ") || "no condition"}`,
  );
}
const kerb = beforeAfter(ix, issues[0])!;
console.log(
  `West entrance step-free: before ${kerb.before.reports} of ${kerb.before.n}, after ${kerb.after.reports} of ${kerb.after.n}`,
);
const riv = queue.filter((a) => a.location.path[0] === "Riverside Interchange");
console.log(`Riverside attention items: ${riv.length}`);

if (DRY) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see --env-file).");
if (PROD_REFS.some((r) => url.includes(r))) {
  throw new Error(`Refusing to write synthetic data to ${url} — that is a live study project.`);
}
const isLocal = /127\.0\.0\.1|localhost/.test(url);
console.log(`\nTarget: ${url}`);
if (!isLocal && !args.has("--yes")) {
  throw new Error("Not a local URL. Re-run with --yes once you have checked the target above.");
}

const db = createClient(url, key, { auth: { persistSession: false } });
async function run<T>(
  label: string,
  p: PromiseLike<{ error: { message: string } | null; data?: T }>,
) {
  const { error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
}
async function insertAll(table: string, rows: object[]) {
  for (let i = 0; i < rows.length; i += 1000) {
    await run(`${table} ${i}`, db.from(table).insert(rows.slice(i, i + 1000)));
  }
  console.log(`  ${table}: ${rows.length}`);
}

await run("delete org", db.from("organisations").delete().eq("slug", ORG_SLUG));
await insertAll("organisations", [
  { id: org.id, slug: ORG_SLUG, name: org.name, sector: org.sector },
]);
// Parents before children: the generator emits them in that order.
await insertAll(
  "locations",
  locations.map((l) => ({
    id: l.id,
    org_id: org.id,
    parent_id: l.parentId,
    level: l.level,
    ref: l.ref,
    label: l.label,
    kind: l.kind,
    lat: l.lat,
    lng: l.lng,
    schematic_x: l.sx,
    schematic_y: l.sy,
    sort: l.sort,
  })),
);
await insertAll("questions", [
  {
    id: question.id,
    org_id: org.id,
    code: question.code,
    version: question.version,
    wording: question.wording,
    scale: question.scale,
    is_primary: true,
    active_from: question.activeFrom,
  },
]);
await insertAll(
  "responses",
  responses.map((r) => ({
    id: r.id,
    org_id: org.id,
    location_id: r.locationId,
    question_id: question.id,
    answered_at: r.at,
    value: r.value,
    segment: r.segment,
    issue_category: r.category,
    severity: r.severity,
    comment: r.comment,
    respondent_key: r.respondentKey,
    after_dark: r.afterDark,
    is_valid: r.valid,
  })),
);
await insertAll(
  "exposure_daily",
  exposure.map((e) => ({ location_id: e.locationId, day: e.day, count: e.count })),
);
await insertAll(
  "context_events",
  events.map((e) => ({
    id: e.id,
    org_id: org.id,
    location_id: e.locationId,
    kind: e.kind,
    label: e.label,
    starts_at: e.startsAt,
    ends_at: e.endsAt,
  })),
);
await insertAll(
  "issues",
  issues.map((i) => ({
    id: i.id,
    org_id: org.id,
    location_id: i.locationId,
    category: i.category,
    title: i.title,
    status: i.status,
    owner: i.owner,
    opened_at: i.openedAt,
    intervention: i.intervention,
    intervention_at: i.interventionAt,
    resolved_at: i.resolvedAt,
    notes: i.notes,
  })),
);
await insertAll(
  "weather_hourly",
  frame.weather.map((w) => ({
    org_id: org.id,
    hour_start: w.hour,
    temp_c: w.tempC,
    precip_mm: w.precipMm,
    wind_kmh: w.windKmh,
    is_dark: w.isDark,
  })),
);
await insertAll(
  "footfall_hourly",
  frame.footfall.map((f) => ({ location_id: f.locationId, hour_start: f.hour, count: f.count })),
);
await insertAll(
  "service_hourly",
  frame.service.map((v) => ({
    location_id: v.locationId,
    hour_start: v.hour,
    buses_scheduled: v.scheduled,
    buses_run: v.run,
    on_time: v.onTime,
  })),
);
console.log("Done.");
