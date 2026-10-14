/**
 * Run: npm test  (node --test, native TypeScript stripping — no build step)
 *
 * Two layers: small hand-built frames pin the derivation rules, and the demo
 * story is checked across several seeds so a tweak to the generator can't
 * quietly lose the finding the walkthrough depends on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attentionQueue,
  beforeAfter,
  heatmap,
  indexFrame,
  localTime,
  select,
  summarise,
  weeklyTrend,
  rangeOf,
  dailySeries,
  type Frame,
  type FrameResponse,
} from "./derive.ts";
import { sectorConfig } from "./tenant-config.ts";
import { buildDemo } from "../../scripts/demo-story.ts";

const bus = sectorConfig("bus");

function tinyFrame(responses: Partial<FrameResponse>[]): Frame {
  return {
    org: { id: "o", name: "Test", sector: "bus" },
    question: {
      id: "q",
      code: "q",
      version: 1,
      wording: "?",
      activeFrom: "2026-01-01",
      scale: [
        { id: "yes_easily", label: "Yes", tone: "clear" },
        { id: "some_difficulty", label: "Some", tone: "friction" },
        { id: "no", label: "No", tone: "blocked" },
      ],
    },
    locations: [
      {
        id: "s",
        parentId: null,
        level: "site",
        ref: "S",
        label: "Site",
        kind: "bus_station",
        lat: 0,
        lng: 0,
        sx: null,
        sy: null,
        sort: 0,
      },
      {
        id: "z",
        parentId: "s",
        level: "zone",
        ref: "S.Z",
        label: "Zone",
        kind: "stand_group",
        lat: null,
        lng: null,
        sx: 0,
        sy: 0,
        sort: 0,
      },
      {
        id: "p",
        parentId: "z",
        level: "point",
        ref: "S.Z.P",
        label: "Stand 1",
        kind: "stand",
        lat: null,
        lng: null,
        sx: 0,
        sy: 0,
        sort: 0,
      },
    ],
    responses: responses.map((r, i) => ({
      id: `r${i}`,
      locationId: "p",
      at: "2026-03-10T17:30:00Z",
      value: "yes_easily",
      segment: null,
      category: null,
      severity: null,
      comment: null,
      respondentKey: `k${i}`,
      afterDark: false,
      valid: true,
      ...r,
    })),
    exposure: [],
    events: [],
    issues: [],
    weather: [],
    footfall: [],
    service: [],
    loadedAt: "2026-03-14T12:00:00Z",
  };
}

test("localTime reads wall-clock London time across the clock change", () => {
  assert.deepEqual(localTime("2026-01-15T17:30:00Z"), { day: "2026-01-15", hour: 17, weekday: 3 });
  assert.deepEqual(localTime("2026-07-15T17:30:00Z"), { day: "2026-07-15", hour: 18, weekday: 2 });
  assert.equal(localTime("2026-07-15T23:30:00Z").day, "2026-07-16");
});

test("invalid responses are excluded everywhere", () => {
  const ix = indexFrame(tinyFrame([{}, { valid: false }]), bus);
  assert.equal(ix.rows.length, 1);
});

test("summary keeps counts, not rates, and keeps a single severe report visible", () => {
  const ix = indexFrame(
    tinyFrame([
      {},
      {},
      { value: "no", category: "boarding", severity: "would_prevent_use_at_all" },
    ]),
    bus,
  );
  const s = summarise(ix, ix.rows);
  assert.equal(s.n, 3);
  assert.equal(s.clear, 2);
  assert.equal(s.blocked, 1);
  assert.equal(s.severe, 1);
  assert.equal(s.lowSample, true);
  assert.deepEqual(
    s.categories.map((c) => [c.id, c.count]),
    [["boarding", 1]],
  );
});

test("distinct people come from respondent keys", () => {
  const ix = indexFrame(tinyFrame([{ respondentKey: "a" }, { respondentKey: "a" }, {}]), bus);
  assert.equal(summarise(ix, ix.rows).people, 2);
});

test("heatmap buckets by local weekday and hour", () => {
  const ix = indexFrame(tinyFrame([{ value: "no" }, {}]), bus);
  const h = heatmap(ix.rows);
  // 2026-03-10 is a Tuesday; 17:30Z is 17:30 GMT.
  assert.deepEqual(h.cells[1][17], { n: 2, difficulty: 1 });
});

test("weekly trend ends on the range end and covers it exactly", () => {
  const ix = indexFrame(
    tinyFrame([{ at: "2026-03-14T10:00:00Z" }, { at: "2026-03-01T10:00:00Z" }]),
    bus,
  );
  const w = weeklyTrend(ix.rows, { from: "2026-03-01", to: "2026-03-14" });
  assert.equal(w.length, 2);
  assert.equal(w[1].weekStart, "2026-03-08");
  assert.deepEqual(
    w.map((b) => b.n),
    [1, 1],
  );
});

test("attention needs enough distinct people unless a report is severe", () => {
  const minor = { value: "some_difficulty", category: "crowding", severity: "minor_inconvenience" };
  const twoPeople = indexFrame(tinyFrame([minor, minor]), bus);
  assert.equal(attentionQueue(twoPeople, {}).length, 0);

  const severe = indexFrame(
    tinyFrame([{ value: "no", category: "boarding", severity: "would_prevent_use_at_all" }]),
    bus,
  );
  const [item] = attentionQueue(severe, {});
  assert.equal(item.category.id, "boarding");
  assert.equal(item.thinEvidence, true);
  // Reported at the zone, not the individual stand.
  assert.equal(item.location.ref, "S.Z");
});

// ─── The demo story ────────────────────────────────────────────────────────

for (const seed of [42, 1, 2, 3, 4]) {
  test(`demo story holds (seed ${seed})`, () => {
    const ix = indexFrame(buildDemo({ seed, today: "2026-10-14" }), bus);
    const queue = attentionQueue(ix, {});

    // The aha leads the queue, with its segment and its time band.
    const [top] = queue;
    assert.equal(top.location.ref, "INTN.SB");
    assert.equal(top.category.id, "audio_announcements");
    assert.equal(top.group?.id, "blind_ps");
    assert.ok(top.weekdayShare >= 0.8, "concentrated on weekdays");
    const peak = top.hours.indexOf(Math.max(...top.hours));
    assert.ok(peak >= 15 && peak <= 18, `evening peak, got ${peak}`);
    assert.equal(top.issue, null, "not yet logged — the walkthrough assigns it");

    // ...while the network as a whole looks healthy.
    const all = summarise(ix, select(ix, { range: rangeOf(ix, {}) }));
    assert.ok(all.clear / all.n > 0.9);

    // Riverside is the calm site.
    assert.equal(queue.filter((a) => a.location.path[0] === "Riverside Interchange").length, 0);

    // The west-entrance kerb fix shows in before/after.
    const kerb = ix.frame.issues.find((i) => i.category === "step_free_route")!;
    const ba = beforeAfter(ix, kerb)!;
    assert.ok(ba.before.reports >= 10, `before: ${ba.before.reports}`);
    assert.ok(ba.after.reports <= 3, `after: ${ba.after.reports}`);

    // Context: the Hospital stops track rain; the concourse tracks busy hours.
    const hosp = queue.find((r) => r.location.ref === "HST.HOSP");
    assert.ok(hosp?.context.rain, "hospital stops: rain context");
    const conc = queue.find((r) => r.location.ref === "CBS.CONC");
    assert.ok(conc?.context.busy || conc?.context.disrupted, "concourse: busy or disruption");

    // Feeds cover every hour, and the daily series adds up.
    assert.equal(ix.frame.weather.length, 84 * 24);
    const range = rangeOf(ix, {});
    const series = dailySeries(ix, { range });
    const inRange = select(ix, { range });
    assert.equal(
      series.reduce((n, d) => n + d.answers, 0),
      inRange.length,
    );
    assert.equal(
      series.reduce((n, d) => n + d.reports, 0),
      inRange.filter((r) => r.tone !== "clear").length,
    );
  });
}
