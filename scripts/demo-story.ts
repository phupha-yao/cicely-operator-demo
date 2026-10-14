/**
 * The bus-franchise demo, as data. Pure: seed and date in, Frame out — so the
 * story can be unit-tested (demo-story.test.ts) and written by generate-demo.ts.
 *
 * Deterministic for a given seed, and relative to `today` so the dashboard
 * never looks stale.
 *
 * The story it encodes — keep docs/demo-script.md in step if you change it:
 *   - Aha: Interchange North, Stand group B (Stands 9–14), which serves the eye
 *     hospital. There are no audio announcements, and at the weekday evening
 *     peak several buses pull in at once — blind and partially sighted riders
 *     can't tell which one is theirs. Invisible in the network average. (A
 *     smaller, separate signal: sighted riders find the displays hard to read
 *     after dark under the new LED canopy.)
 *   - Resolved win: Central Bus Station west entrance. No dropped kerb on the
 *     step-free route until one was installed six weeks ago.
 *   - Watch items: shelter and seating at the Hospital stops in the rain; peak
 *     crowding on the Central concourse; the accessible toilet closed for works.
 *   - Green: Riverside Interchange.
 */
import { randomUUID } from "node:crypto";
import type {
  Frame,
  FrameEvent,
  FrameFootfall,
  FrameIssue,
  FrameLocation,
  FrameResponse,
  FrameService,
  FrameWeather,
} from "../src/lib/derive.ts";

export type DemoOptions = {
  seed?: number;
  /** YYYY-MM-DD, the last day of data. Defaults to today. */
  today?: string;
  name?: string;
  centre?: [number, number];
};

export const DAYS = 84;

export function buildDemo(opts: DemoOptions = {}): Frame {
  const seed = opts.seed ?? 42;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const name = opts.name ?? "Northline Buses";
  const [lat0, lng0] = opts.centre ?? [53.4808, -2.2426];

  // ─── Seeded randomness ─────────────────────────────────────────────────────
  function mulberry32(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(seed);
  const chance = (p: number) => rand() < p;
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  function weighted<T>(entries: [T, number][]): T {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let x = rand() * total;
    for (const [v, w] of entries) if ((x -= w) <= 0) return v;
    return entries[entries.length - 1][0];
  }
  function poisson(mean: number) {
    const L = Math.exp(-mean);
    let k = 0,
      p = 1;
    do {
      k++;
      p *= rand();
    } while (p > L);
    return k - 1;
  }

  // ─── Calendar and local time (Europe/London) ───────────────────────────────
  const dayList = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (DAYS - 1 - i));
    return d.toISOString().slice(0, 10);
  });
  const weekdayOf = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // Mon=0

  const offsetFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hourCycle: "h23",
  });
  /** UTC instant for a London wall-clock time. */
  function londonToUtc(day: string, hour: number, minute: number): Date {
    const guess = new Date(
      `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
    );
    const shown = Number(offsetFmt.format(guess));
    const offset = (shown - guess.getUTCHours() + 24) % 24; // 0 (GMT) or 1 (BST)
    return new Date(guess.getTime() - offset * 3_600_000);
  }
  /** Approximate end of civil twilight, as a UTC instant. Good to ~10 minutes. */
  function darkFrom(day: string, lat: number, lng: number): Date {
    const d = new Date(`${day}T00:00:00Z`);
    const n = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
    const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + n)) / 365);
    const phi = (lat * Math.PI) / 180;
    const ha = Math.acos(-Math.tan(phi) * Math.tan(decl)) * (180 / Math.PI);
    const sunsetUtcHours = 12 + ha / 15 - lng / 15 + 0.5; // +0.5h ≈ civil twilight
    return new Date(d.getTime() + sunsetUtcHours * 3_600_000);
  }

  const HOURS_WEEKDAY: [number, number][] = [
    [5, 1],
    [6, 3],
    [7, 8],
    [8, 10],
    [9, 6],
    [10, 4],
    [11, 4],
    [12, 5],
    [13, 5],
    [14, 5],
    [15, 7],
    [16, 9],
    [17, 10],
    [18, 8],
    [19, 5],
    [20, 3],
    [21, 2],
    [22, 1],
    [23, 0.5],
  ];
  const HOURS_WEEKEND: [number, number][] = [
    [7, 1],
    [8, 2],
    [9, 3],
    [10, 5],
    [11, 6],
    [12, 7],
    [13, 7],
    [14, 7],
    [15, 6],
    [16, 6],
    [17, 5],
    [18, 4],
    [19, 3],
    [20, 2],
    [21, 2],
    [22, 1],
  ];

  // ─── The network ───────────────────────────────────────────────────────────
  type Node = {
    ref: string;
    label: string;
    kind: string;
    /** Daily exposure on a weekday, for leaves. */
    daily?: number;
    sx?: number;
    sy?: number;
    children?: Node[];
  };
  type SiteSpec = Node & {
    dLat: number;
    dLng: number;
    pool: number;
    /** Segment share overrides for this site's rider pool. */
    shares?: Record<string, number>;
  };

  const stands = (prefix: string, from: number, to: number, daily: number, y: number): Node[] =>
    Array.from({ length: to - from + 1 }, (_, i) => {
      const n = from + i;
      return {
        ref: `${prefix}.S${String(n).padStart(2, "0")}`,
        label: `Stand ${n}`,
        kind: "stand",
        daily,
        sx: 8 + (i * 84) / Math.max(1, to - from),
        sy: y,
      };
    });

  const SITES: SiteSpec[] = [
    {
      ref: "CBS",
      label: "Central Bus Station",
      kind: "bus_station",
      dLat: 0,
      dLng: 0,
      pool: 1500,
      children: [
        { ref: "CBS.WEST", label: "West entrance", kind: "entrance", daily: 2600, sx: 4, sy: 50 },
        { ref: "CBS.EAST", label: "East entrance", kind: "entrance", daily: 2200, sx: 96, sy: 50 },
        { ref: "CBS.CONC", label: "Concourse", kind: "concourse", daily: 3800, sx: 50, sy: 50 },
        { ref: "CBS.SHOP", label: "Travel shop", kind: "travel_shop", daily: 300, sx: 30, sy: 30 },
        {
          ref: "CBS.WAIT",
          label: "Waiting room",
          kind: "waiting_room",
          daily: 500,
          sx: 70,
          sy: 30,
        },
        { ref: "CBS.WC", label: "Toilets", kind: "toilets", daily: 400, sx: 80, sy: 70 },
        {
          ref: "CBS.STANDS",
          label: "Stands 1–10",
          kind: "stand_group",
          sx: 50,
          sy: 85,
          children: stands("CBS", 1, 10, 600, 85),
        },
      ],
    },
    {
      ref: "INTN",
      label: "Interchange North",
      kind: "interchange",
      dLat: 0.031,
      dLng: 0.012,
      pool: 900,
      // Serves the eye hospital.
      shares: { blind_ps: 0.06 },
      children: [
        { ref: "INTN.ENT", label: "Main entrance", kind: "entrance", daily: 2400, sx: 10, sy: 50 },
        { ref: "INTN.CONC", label: "Concourse", kind: "concourse", daily: 2900, sx: 40, sy: 50 },
        {
          ref: "INTN.INFO",
          label: "Travel information desk",
          kind: "travel_shop",
          daily: 200,
          sx: 40,
          sy: 25,
        },
        {
          ref: "INTN.SA",
          label: "Stand group A (Stands 1–8)",
          kind: "stand_group",
          sx: 75,
          sy: 25,
          children: stands("INTN", 1, 8, 380, 25),
        },
        {
          ref: "INTN.SB",
          label: "Stand group B (Stands 9–14)",
          kind: "stand_group",
          sx: 75,
          sy: 75,
          children: stands("INTN", 9, 14, 460, 75),
        },
      ],
    },
    {
      ref: "RIV",
      label: "Riverside Interchange",
      kind: "interchange",
      dLat: -0.018,
      dLng: -0.035,
      pool: 250,
      children: [
        { ref: "RIV.ENT", label: "Entrance", kind: "entrance", daily: 800, sx: 15, sy: 50 },
        {
          ref: "RIV.SHEL",
          label: "Covered waiting area",
          kind: "waiting_room",
          daily: 600,
          sx: 50,
          sy: 50,
        },
        {
          ref: "RIV.STANDS",
          label: "Stands 1–4",
          kind: "stand_group",
          sx: 80,
          sy: 50,
          children: stands("RIV", 1, 4, 250, 50),
        },
      ],
    },
    {
      ref: "HST",
      label: "High Street corridor",
      kind: "corridor",
      dLat: 0.012,
      dLng: -0.021,
      pool: 300,
      // Runs past the general hospital.
      shares: { older: 0.14, mobility: 0.07 },
      children: (
        [
          ["MKT", "Market Square stops", 20],
          ["LIB", "Library stops", 50],
          ["HOSP", "Hospital stops", 80],
        ] as const
      ).map(([code, label, sx]) => ({
        ref: `HST.${code}`,
        label,
        kind: "stop_pair",
        sx,
        sy: 50,
        children: (["A", "B"] as const).map((side, i) => ({
          ref: `HST.${code}.${side}`,
          label: `${label.replace(" stops", "")} stop ${side}`,
          kind: "stop",
          daily: code === "HOSP" ? 850 : 520,
          sx,
          sy: i === 0 ? 35 : 65,
        })),
      })),
    },
  ];

  // Flatten into frame locations.
  const locations: FrameLocation[] = [];
  const leaves: { loc: FrameLocation; site: SiteSpec; daily: number; zoneRef: string }[] = [];
  for (const [si, site] of SITES.entries()) {
    const siteLoc: FrameLocation = {
      id: randomUUID(),
      parentId: null,
      level: "site",
      ref: site.ref,
      label: site.label,
      kind: site.kind,
      lat: lat0 + site.dLat,
      lng: lng0 + site.dLng,
      sx: null,
      sy: null,
      sort: si,
    };
    locations.push(siteLoc);
    for (const [zi, zone] of (site.children ?? []).entries()) {
      const zoneLoc: FrameLocation = {
        id: randomUUID(),
        parentId: siteLoc.id,
        level: "zone",
        ref: zone.ref,
        label: zone.label,
        kind: zone.kind,
        lat: null,
        lng: null,
        sx: zone.sx ?? null,
        sy: zone.sy ?? null,
        sort: zi,
      };
      locations.push(zoneLoc);
      if (!zone.children) {
        leaves.push({ loc: zoneLoc, site, daily: zone.daily!, zoneRef: zone.ref });
        continue;
      }
      for (const [pi, point] of zone.children.entries()) {
        const pointLoc: FrameLocation = {
          id: randomUUID(),
          parentId: zoneLoc.id,
          level: "point",
          ref: point.ref,
          label: point.label,
          kind: point.kind,
          lat: null,
          lng: null,
          sx: point.sx ?? null,
          sy: point.sy ?? null,
          sort: pi,
        };
        locations.push(pointLoc);
        leaves.push({ loc: pointLoc, site, daily: point.daily!, zoneRef: zone.ref });
      }
    }
  }
  const byRef = new Map(locations.map((l) => [l.ref, l]));
  const siteLat = new Map(SITES.map((s) => [s.ref, [lat0 + s.dLat, lng0 + s.dLng]]));

  // ─── Riders ────────────────────────────────────────────────────────────────
  type Rider = { key: string; segment: string | null };
  const SEGMENT_SHARES: [string | null, number][] = [
    [null, 0.45],
    ["none", 0.3],
    ["older", 0.07],
    ["mobility", 0.04],
    ["wheelchair", 0.02],
    ["blind_ps", 0.02],
    ["deaf_hoh", 0.02],
    ["neurodivergent", 0.04],
    ["pushchair", 0.04],
  ];
  const pools = new Map<string, Rider[]>();
  for (const site of SITES) {
    const pool: Rider[] = [];
    for (const [segment, share] of SEGMENT_SHARES) {
      const s = (segment ? site.shares?.[segment] : undefined) ?? share;
      for (let i = 0; i < Math.round(site.pool * s); i++) {
        pool.push({ key: `rk_${Math.floor(rand() * 2 ** 40).toString(36)}`, segment });
      }
    }
    pools.set(site.ref, pool);
  }
  // Regular blind and partially sighted riders at Stand group B — commuters and
  // eye-hospital patients who use it most weekdays. Repeat answers from the
  // same people are what make "9 of 14 riders" possible.
  const sbRegulars = pools
    .get("INTN")!
    .filter((r) => r.segment === "blind_ps")
    .slice(0, 18);

  // ─── Context events ────────────────────────────────────────────────────────
  const events: FrameEvent[] = [];
  const wetSpans: { from: number; to: number }[] = [];
  const event = (kind: FrameEvent["kind"], label: string, from: Date, to: Date, ref?: string) =>
    events.push({
      id: randomUUID(),
      kind,
      label,
      locationId: ref ? byRef.get(ref)!.id : null,
      startsAt: from.toISOString(),
      endsAt: to.toISOString(),
    });
  for (const day of dayList) {
    // Wetter as autumn sets in.
    if (!chance(dayList.indexOf(day) > DAYS - 36 ? 0.4 : 0.18)) continue;
    const start = 6 + Math.floor(rand() * 12);
    const from = londonToUtc(day, start, 0);
    const to = londonToUtc(day, Math.min(23, start + 2 + Math.floor(rand() * 6)), 0);
    wetSpans.push({ from: from.getTime(), to: to.getTime() });
    event("weather", "Heavy rain", from, to);
  }
  const dayAt = (offset: number) => dayList[DAYS - 1 + offset];
  const toiletWorks = { from: londonToUtc(dayAt(-30), 6, 0), to: londonToUtc(dayAt(-9), 22, 0) };
  event(
    "works",
    "Accessible toilet closed for refurbishment",
    toiletWorks.from,
    toiletWorks.to,
    "CBS.WC",
  );
  const marketWorks = { from: londonToUtc(dayAt(-52), 6, 0), to: londonToUtc(dayAt(-39), 22, 0) };
  event(
    "works",
    "Roadworks — Market Square stops moved 50m",
    marketWorks.from,
    marketWorks.to,
    "HST.MKT",
  );
  for (const off of [-61, -23]) {
    event(
      "disruption",
      "Reduced frequency — driver shortage",
      londonToUtc(dayAt(off), 5, 0),
      londonToUtc(dayAt(off), 23, 59),
    );
  }
  const matchDays = dayList.filter((d) => weekdayOf(d) === 5).filter((_, i) => i % 4 === 1);
  for (const d of matchDays) {
    event("disruption", "Match-day crowds", londonToUtc(d, 15, 0), londonToUtc(d, 19, 0), "CBS");
  }
  const disruptions = events.filter((e) => e.kind === "disruption");

  // ─── Difficulty rules ──────────────────────────────────────────────────────
  type Ctx = {
    ref: string;
    zoneRef: string;
    siteRef: string;
    day: string;
    hour: number;
    weekday: number;
    at: number;
    dark: boolean;
    wet: boolean;
    disrupted: boolean;
    segment: string | null;
  };
  type Hit = {
    category: string;
    p: number;
    severity: [string, number][];
    /** What people say about it — specific to the rule that produced it. */
    comments: string[];
  };

  const MINOR: [string, number][] = [
    ["minor_inconvenience", 3],
    ["noticeable_difficulty", 1],
  ];
  const MID: [string, number][] = [
    ["noticeable_difficulty", 3],
    ["serious_barrier", 1],
  ];
  const HARD: [string, number][] = [
    ["serious_barrier", 3],
    ["would_prevent_independent_use", 3],
    ["would_prevent_use_at_all", 1],
  ];
  const KERB_FIXED = londonToUtc(dayAt(-42), 12, 0).getTime();
  const NEEDS_STEP_FREE = new Set(["wheelchair", "mobility", "pushchair"]);
  const BASELINE_CATS = [
    "finding_stop",
    "boarding",
    "realtime_info",
    "seating_shelter",
    "crowding",
    "staff_help",
    "lighting_safety",
  ];

  function hitsFor(c: Ctx): Hit[] {
    const hits: Hit[] = [];
    const peak = c.weekday < 5 && ((c.hour >= 7 && c.hour < 9) || (c.hour >= 16 && c.hour < 18));

    // Aha: Stand group B, blind/partially sighted riders, weekday evening peak.
    if (c.zoneRef === "INTN.SB") {
      if (c.segment === "blind_ps") {
        const evening = c.weekday < 5 && c.hour >= 16 && c.hour < 19;
        hits.push({
          category: "audio_announcements",
          comments: COMMENTS.audio_announcements,
          p: evening ? 0.75 : 0.12,
          severity: evening ? HARD : MID,
        });
      } else if (c.dark) {
        hits.push({
          category: "realtime_info",
          comments: COMMENTS.realtime_info,
          p: 0.04,
          severity: MINOR,
        });
      }
    }
    // Resolved win: no dropped kerb at the west entrance until it was fixed.
    if (c.ref === "CBS.WEST" && c.segment && NEEDS_STEP_FREE.has(c.segment)) {
      hits.push({
        category: "step_free_route",
        comments: COMMENTS.step_free_route,
        p: c.at < KERB_FIXED ? 0.55 : 0.03,
        severity: c.at < KERB_FIXED ? HARD : MINOR,
      });
    }
    // Hospital stops: no seating, thin shelter — bites in the rain.
    if (c.zoneRef === "HST.HOSP") {
      const needsSeat =
        c.segment === "older" || c.segment === "mobility" || c.segment === "wheelchair";
      hits.push({
        category: "seating_shelter",
        comments: COMMENTS.seating_shelter,
        p: needsSeat ? (c.wet ? 0.75 : 0.05) : c.wet ? 0.15 : 0.01,
        severity: needsSeat ? MID : MINOR,
      });
    }
    // Central concourse crowding at peak, worse on disruption days.
    if (c.ref === "CBS.CONC" && (peak || c.disrupted)) {
      const nd = c.segment === "neurodivergent";
      hits.push({
        category: "crowding",
        comments: COMMENTS.crowding,
        p: (nd ? 0.35 : 0.05) * (c.disrupted ? 2 : 1),
        severity: nd ? MID : MINOR,
      });
    }
    // Accessible toilet closed for works.
    if (
      c.ref === "CBS.WC" &&
      c.at >= toiletWorks.from.getTime() &&
      c.at < toiletWorks.to.getTime()
    ) {
      hits.push({
        category: "facilities",
        comments: COMMENTS.facilities,
        p: c.segment === "wheelchair" ? 0.7 : 0.12,
        severity: c.segment === "wheelchair" ? HARD : MID,
      });
    }
    // Market Square roadworks: stops moved and hard to find.
    if (
      c.zoneRef === "HST.MKT" &&
      c.at >= marketWorks.from.getTime() &&
      c.at < marketWorks.to.getTime()
    ) {
      hits.push({
        category: "finding_stop",
        comments: COMMENTS.finding_stop,
        p: c.segment === "blind_ps" ? 0.6 : 0.15,
        severity: MID,
      });
    }
    // Background noise: small, spread, mostly minor. Riverside is a calm site.
    const base =
      (c.segment && c.segment !== "none" ? 0.04 : 0.02) * (c.siteRef === "RIV" ? 0.4 : 1);
    const background = pick(BASELINE_CATS);
    hits.push({
      category: background,
      comments: GENERIC[background] ?? [],
      p: base,
      severity: MINOR,
    });
    return hits;
  }

  // Comments that could be said anywhere — for background difficulty, so a
  // stray "hospital stop" quote never turns up at the wrong station.
  const GENERIC: Record<string, string[]> = {
    finding_stop: ["Took me a while to work out which stand I needed.", "Signs could be clearer."],
    boarding: ["Bus stopped too far from the kerb.", "Ramp didn't deploy first time."],
    realtime_info: ["Display said due but the bus didn't come.", "Times on the screen were wrong."],
    seating_shelter: ["Not enough seats while waiting.", "Got wet waiting."],
    crowding: ["Quite busy, had to queue to get on.", "Hard to get through the crowd."],
    staff_help: ["Couldn't find anyone to ask.", "Nobody around to help."],
    lighting_safety: ["Felt a bit dark and isolated waiting here."],
  };

  const COMMENTS: Record<string, string[]> = {
    audio_announcements: [
      "No announcements at all, I had to ask a stranger which bus it was.",
      "Three buses pulled in at once and I couldn't tell which was mine.",
      "At rush hour the buses come in together and nothing tells you which is which.",
      "I let my bus go because I couldn't be sure it was the right one.",
      "Drivers don't always call out the number. I end up waving at every bus.",
      "I can't see the screen so I just have to hope. An audio announcement would fix this.",
      "Missed my bus twice this week, there's nothing to tell you it's arrived.",
      "There used to be a help point that read out the times, it's gone since the refit.",
    ],
    realtime_info: [
      "The new lights reflect straight off the display, I can't read it after dark.",
      "Screen is unreadable at night with the glare from the canopy.",
      "Display is too high and too bright to read with my eyesight.",
    ],
    step_free_route: [
      "No dropped kerb at the crossing outside the west doors, I had to go all the way round.",
      "Couldn't get my wheelchair up the kerb by the west entrance.",
      "Pushchair access from the west side is a nightmare, had to lift it.",
    ],
    seating_shelter: [
      "Nowhere to sit at the hospital stop and the shelter doesn't keep the rain off.",
      "I can't stand for long and there's no seat. Had to wait in the rain.",
      "Shelter is too small, everyone gets soaked.",
    ],
    crowding: [
      "Far too busy at rush hour, it was overwhelming.",
      "Concourse is packed and noisy, I had to leave and come back.",
      "Couldn't get through the crowd to my stand.",
    ],
    facilities: [
      "Accessible toilet closed again with no alternative.",
      "Nowhere accessible to go, had to cut my journey short.",
    ],
    finding_stop: [
      "The stop has moved and there's no sign telling you where.",
      "Couldn't find the temporary stop.",
    ],
    boarding: ["Bus stopped too far from the kerb.", "Ramp didn't deploy."],
    staff_help: ["Couldn't find anyone to ask."],
    lighting_safety: ["Felt a bit dark and isolated waiting here."],
  };

  function severityToValue(severity: string): string {
    if (severity === "would_prevent_use_at_all") return "no";
    if (severity === "would_prevent_independent_use") return "only_with_help";
    if (severity === "serious_barrier") return chance(0.3) ? "only_with_help" : "some_difficulty";
    return "some_difficulty";
  }

  // ─── Responses and exposure ────────────────────────────────────────────────
  const RESPONSE_RATE = 0.005;
  const responses: FrameResponse[] = [];
  const exposure: { locationId: string; day: string; count: number }[] = [];

  for (const day of dayList) {
    const wd = weekdayOf(day);
    const weekend = wd >= 5;
    const curve = weekend ? HOURS_WEEKEND : HOURS_WEEKDAY;
    const curveTotal = curve.reduce((s, [, w]) => s + w, 0);
    for (const leaf of leaves) {
      const count = Math.round(leaf.daily * (weekend ? 0.62 : 1) * (0.9 + rand() * 0.2));
      exposure.push({ locationId: leaf.loc.id, day, count });
      const [lat, lng] = siteLat.get(leaf.site.ref)!;
      const dark = darkFrom(day, lat, lng).getTime();
      const pool = pools.get(leaf.site.ref)!;
      const n = poisson(count * RESPONSE_RATE);
      for (let i = 0; i < n; i++) {
        const hour = weighted(curve.map(([h, w]) => [h, w / curveTotal] as [number, number]));
        const at = londonToUtc(day, hour, Math.floor(rand() * 60));
        const t = at.getTime();
        const rider =
          leaf.zoneRef === "INTN.SB" && wd < 5 && chance(0.14) ? pick(sbRegulars) : pick(pool);
        const ctx: Ctx = {
          ref: leaf.loc.ref,
          zoneRef: leaf.zoneRef,
          siteRef: leaf.site.ref,
          day,
          hour,
          weekday: wd,
          at: t,
          dark: t >= dark || hour < 6,
          wet: wetSpans.some((s) => t >= s.from && t < s.to),
          disrupted: disruptions.some(
            (e) =>
              t >= Date.parse(e.startsAt) &&
              t < Date.parse(e.endsAt) &&
              (!e.locationId || e.locationId === byRef.get(leaf.site.ref)!.id),
          ),
          segment: rider.segment,
        };
        const hit = hitsFor(ctx)
          .filter((h) => chance(h.p))
          .map((h) => ({ ...h, sev: weighted(h.severity) }));
        const rank = (s: string) =>
          [
            "minor_inconvenience",
            "noticeable_difficulty",
            "serious_barrier",
            "would_prevent_independent_use",
            "would_prevent_use_at_all",
          ].indexOf(s);
        const main = hit.sort((a, b) => rank(b.sev) - rank(a.sev))[0];
        responses.push({
          id: randomUUID(),
          locationId: leaf.loc.id,
          at: at.toISOString(),
          value: main ? severityToValue(main.sev) : "yes_easily",
          segment: rider.segment,
          category: main?.category ?? null,
          severity: main?.sev ?? null,
          comment:
            main?.comments.length && chance(main.sev === "minor_inconvenience" ? 0.15 : 0.45)
              ? pick(main.comments)
              : null,
          respondentKey: rider.key,
          afterDark: ctx.dark,
          valid: !chance(0.004),
        });
      }
    }
  }

  // ─── Hourly context feeds ──────────────────────────────────────────────────
  // Weather (network-wide), footfall and bus service (per station), every hour
  // of the period in UTC — iterating UTC keeps one row per hour across clock
  // changes. Separate seeded stream so adding feeds never shifts the story.
  const frand = mulberry32(seed + 7919);
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD
  const hourFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const weather: FrameWeather[] = [];
  const footfall: FrameFootfall[] = [];
  const service: FrameService[] = [];
  const BUSES_PER_HOUR: Record<string, number> = { CBS: 40, INTN: 30, RIV: 10, HST: 16 };
  const siteDaily = new Map<string, number>();
  for (const leaf of leaves) {
    siteDaily.set(leaf.site.ref, (siteDaily.get(leaf.site.ref) ?? 0) + leaf.daily);
  }
  const shortages = events.filter((e) => e.label.startsWith("Reduced frequency"));
  const inSpan = (t: number, list: { startsAt: string; endsAt: string }[]) =>
    list.some((e) => t >= Date.parse(e.startsAt) && t < Date.parse(e.endsAt));
  const matchCrowds = events.filter((e) => e.label === "Match-day crowds");

  const start = londonToUtc(dayList[0], 0, 0).getTime();
  const end = londonToUtc(dayList[DAYS - 1], 23, 0).getTime();
  for (let t = start; t <= end; t += 3_600_000) {
    const at = new Date(t);
    const iso = at.toISOString();
    const h = Number(hourFmt.format(at));
    const day = dayFmt.format(at);
    const dayIdx = dayList.indexOf(day);
    const weekend = weekdayOf(day) >= 5;
    const wet = wetSpans.some((w) => t >= w.from && t < w.to);

    // Late July ~18°C mean easing to ~11°C by mid-October; warmest mid-afternoon.
    const mean = 18 - (7 * dayIdx) / DAYS;
    const temp =
      mean + 4 * Math.sin(((h - 9) * Math.PI) / 12) + (frand() - 0.5) * 2 - (wet ? 2 : 0);
    weather.push({
      hour: iso,
      tempC: Math.round(temp * 10) / 10,
      precipMm: wet ? Math.round((0.6 + frand() * 3.4) * 10) / 10 : 0,
      windKmh: Math.round(8 + frand() * 10 + (wet ? 10 : 0)),
      isDark: t >= darkFrom(day, lat0, lng0).getTime() || h < 6,
    });

    const curve = weekend ? HOURS_WEEKEND : HOURS_WEEKDAY;
    const curveTotal = curve.reduce((sum, [, w]) => sum + w, 0);
    const weight = curve.find(([ch]) => ch === h)?.[1] ?? 0;
    const peak = !weekend && ((h >= 7 && h < 9) || (h >= 16 && h < 18));
    const shortage = inSpan(t, shortages);
    for (const site of SITES) {
      const siteId = byRef.get(site.ref)!.id;
      // Footfall counts people through the station, not just answer points.
      let people = ((siteDaily.get(site.ref) ?? 0) * (weekend ? 0.62 : 1) * weight) / curveTotal;
      if (site.ref === "CBS" && inSpan(t, matchCrowds)) people *= 1.8;
      footfall.push({
        locationId: siteId,
        hour: iso,
        count: Math.round(people * 1.4 * (0.9 + frand() * 0.2)),
      });

      const scheduled =
        h < 5 ? 0 : Math.round(BUSES_PER_HOUR[site.ref] * (peak ? 1.3 : h >= 20 ? 0.5 : 1));
      const run = shortage ? Math.round(scheduled * 0.72) : scheduled;
      const onTimeShare = Math.max(
        0.3,
        Math.min(
          1,
          0.92 -
            (peak ? 0.08 : 0) -
            (wet ? 0.1 : 0) -
            (shortage ? 0.25 : 0) +
            (frand() - 0.5) * 0.08,
        ),
      );
      service.push({
        locationId: siteId,
        hour: iso,
        scheduled,
        run,
        onTime: Math.round(run * onTimeShare),
      });
    }
  }

  // ─── Issues log ────────────────────────────────────────────────────────────
  const issue = (
    ref: string,
    category: string,
    title: string,
    rest: Partial<FrameIssue>,
  ): FrameIssue => ({
    id: randomUUID(),
    locationId: byRef.get(ref)!.id,
    category,
    title,
    status: "new",
    owner: null,
    openedAt: new Date().toISOString(),
    intervention: null,
    interventionAt: null,
    resolvedAt: null,
    notes: null,
    ...rest,
  });
  const issues: FrameIssue[] = [
    issue(
      "CBS.WEST",
      "step_free_route",
      "No dropped kerb on the step-free route at the west entrance",
      {
        status: "resolved",
        owner: "Estates — Central Bus Station",
        openedAt: londonToUtc(dayAt(-74), 10, 0).toISOString(),
        intervention: "Dropped kerb and tactile paving installed at the west entrance crossing",
        interventionAt: new Date(KERB_FIXED).toISOString(),
        resolvedAt: londonToUtc(dayAt(-40), 9, 0).toISOString(),
      },
    ),
    issue("CBS.WC", "facilities", "Accessible toilet closed during refurbishment", {
      status: "monitoring",
      owner: "Facilities contractor",
      openedAt: londonToUtc(dayAt(-27), 9, 0).toISOString(),
      intervention: "Refurbishment completed; temporary signage to the nearest alternative added",
      interventionAt: toiletWorks.to.toISOString(),
    }),
    issue("HST.HOSP", "seating_shelter", "No seating and limited shelter at the Hospital stops", {
      status: "investigating",
      owner: "Highways liaison (council)",
      openedAt: londonToUtc(dayAt(-19), 14, 0).toISOString(),
      notes: "Shelter is council-owned; raised at the October partnership meeting.",
    }),
  ];

  // ─── Assemble ──────────────────────────────────────────────────────────────
  const SCALE = [
    { id: "yes_easily", label: "Yes, easily", tone: "clear" },
    { id: "some_difficulty", label: "Yes, with some difficulty", tone: "friction" },
    { id: "only_with_help", label: "Only with help", tone: "blocked" },
    { id: "no", label: "No", tone: "blocked" },
  ] as const;
  const question = {
    id: randomUUID(),
    code: "board_ok",
    version: 1,
    wording: "Could you get to your bus and board it without difficulty today?",
    scale: SCALE.map((s) => ({ ...s })),
    activeFrom: dayList[0],
  };
  const org = { id: randomUUID(), name, sector: "bus" };
  return {
    org,
    question,
    locations,
    responses,
    exposure,
    events,
    issues,
    weather,
    footfall,
    service,
    // The dashboard's "today" is the last generated day.
    loadedAt: londonToUtc(today, 23, 0).toISOString(),
  };
}
