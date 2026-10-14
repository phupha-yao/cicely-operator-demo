/**
 * Pure derivation for the operator dashboard: frame in, view models out.
 *
 * Everything here is deterministic and free of I/O so it can be unit-tested
 * and reasoned about without a database. Three rules hold across every output:
 *
 *  - Every figure carries its denominator ("9 of 12"). Nothing is a bare
 *    percentage and nothing is a composite score.
 *  - Small samples are shown, flagged, never hidden — and never ranked above
 *    better-evidenced findings unless they are severe.
 *  - Time is local (TIME_ZONE): an operator thinks in "the 5pm peak", not UTC.
 */
import {
  ATTENTION_MIN_LIFT,
  ATTENTION_MIN_PEOPLE,
  ATTENTION_WINDOW_DAYS,
  MIN_SAMPLE,
  TIME_ZONE,
  labelOf,
  severityOf,
  type Category,
  type SectorConfig,
  type Severity,
  type Tone,
} from "./tenant-config.ts";

// ─── Frame (what the server loads) ─────────────────────────────────────────

export type Level = "site" | "zone" | "point";

export type ScaleOption = { id: string; label: string; tone: Tone };

export type FrameLocation = {
  id: string;
  parentId: string | null;
  level: Level;
  ref: string;
  label: string;
  kind: string;
  lat: number | null;
  lng: number | null;
  sx: number | null;
  sy: number | null;
  sort: number;
};

export type FrameResponse = {
  id: string;
  locationId: string;
  at: string;
  value: string;
  segment: string | null;
  category: string | null;
  severity: string | null;
  comment: string | null;
  respondentKey: string | null;
  afterDark: boolean;
  valid: boolean;
};

export type FrameQuestion = {
  id: string;
  code: string;
  version: number;
  wording: string;
  scale: ScaleOption[];
  activeFrom: string;
};

export type FrameExposure = { locationId: string; day: string; count: number };

export type FrameEvent = {
  id: string;
  locationId: string | null;
  kind: "weather" | "disruption" | "works";
  label: string;
  startsAt: string;
  endsAt: string;
};

export type FrameIssue = {
  id: string;
  locationId: string;
  category: string;
  title: string;
  status: string;
  owner: string | null;
  openedAt: string;
  intervention: string | null;
  interventionAt: string | null;
  resolvedAt: string | null;
  notes: string | null;
};

/** Network-wide weather for one hour. `hour` is the hour's start, ISO. */
export type FrameWeather = {
  hour: string;
  tempC: number;
  precipMm: number;
  windKmh: number;
  isDark: boolean;
};
/** People through a station (site-level location) in one hour. */
export type FrameFootfall = { locationId: string; hour: string; count: number };
/** Buses at a station in one hour. */
export type FrameService = {
  locationId: string;
  hour: string;
  scheduled: number;
  run: number;
  onTime: number;
};

export type Frame = {
  org: { id: string; name: string; sector: string };
  question: FrameQuestion;
  locations: FrameLocation[];
  responses: FrameResponse[];
  exposure: FrameExposure[];
  events: FrameEvent[];
  issues: FrameIssue[];
  weather: FrameWeather[];
  footfall: FrameFootfall[];
  service: FrameService[];
  loadedAt: string;
};

export type Filters = { from?: string; to?: string; segment?: string };

// ─── Local time ────────────────────────────────────────────────────────────

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type LocalTime = { day: string; hour: number; weekday: number };

export function localTime(iso: string): LocalTime {
  const p: Record<string, string> = {};
  for (const part of PARTS.formatToParts(new Date(iso))) p[part.type] = part.value;
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000,
  );
}

// ─── Index ─────────────────────────────────────────────────────────────────

/** Conditions a response can be read against. */
export type Condition = "rain" | "dark" | "disrupted" | "works" | "busy" | "late";
export const CONDITIONS: { id: Condition; label: string; inside: string; outside: string }[] = [
  { id: "rain", label: "Rain", inside: "Raining (0.5mm+ in the hour)", outside: "Dry" },
  { id: "dark", label: "Dark", inside: "After dark", outside: "Daylight" },
  { id: "disrupted", label: "Disruption", inside: "Service disruption", outside: "Normal service" },
  { id: "works", label: "Works", inside: "Works on site", outside: "No works" },
  { id: "busy", label: "Busy", inside: "Busiest quarter of hours", outside: "Other hours" },
  {
    id: "late",
    label: "Buses late",
    inside: "Under 80% of buses on time",
    outside: "80%+ on time",
  },
];

export type Row = FrameResponse &
  LocalTime & {
    tone: Tone;
    siteId: string;
    cond: Record<Condition, boolean>;
  };

/** UTC hour key, "2026-10-14T17" — joins responses to the hourly feeds. */
export function hourKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 13);
}

export type Index = {
  frame: Frame;
  config: SectorConfig;
  byId: Map<string, FrameLocation>;
  byRef: Map<string, FrameLocation>;
  children: Map<string | null, FrameLocation[]>;
  /** location id → ids of itself and every descendant */
  subtree: Map<string, Set<string>>;
  rows: Row[];
  /** Latest day with data, or the load day — the "today" of the dashboard. */
  today: string;
  /** location id → its site (root) id */
  siteOf: Map<string, string>;
  weatherByHour: Map<string, FrameWeather>;
  /** `${siteId}|${hourKey}` → feed row */
  footfallBySiteHour: Map<string, number>;
  serviceBySiteHour: Map<string, FrameService>;
};

export function indexFrame(frame: Frame, config: SectorConfig): Index {
  const byId = new Map(frame.locations.map((l) => [l.id, l]));
  const byRef = new Map(frame.locations.map((l) => [l.ref, l]));
  const children = new Map<string | null, FrameLocation[]>();
  for (const l of frame.locations) {
    const list = children.get(l.parentId) ?? [];
    list.push(l);
    children.set(l.parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.sort - b.sort);

  const subtree = new Map<string, Set<string>>();
  const collect = (id: string): Set<string> => {
    const cached = subtree.get(id);
    if (cached) return cached;
    const set = new Set([id]);
    for (const c of children.get(id) ?? []) for (const d of collect(c.id)) set.add(d);
    subtree.set(id, set);
    return set;
  };
  for (const l of frame.locations) collect(l.id);

  const siteOf = new Map<string, string>();
  for (const l of frame.locations) {
    let cur = l;
    while (cur.parentId) cur = byId.get(cur.parentId)!;
    siteOf.set(l.id, cur.id);
  }

  const weatherByHour = new Map(frame.weather.map((w) => [hourKey(w.hour), w]));
  const footfallBySiteHour = new Map(
    frame.footfall.map((f) => [`${f.locationId}|${hourKey(f.hour)}`, f.count]),
  );
  const serviceBySiteHour = new Map(
    frame.service.map((s) => [`${s.locationId}|${hourKey(s.hour)}`, s]),
  );

  // "Busy" is relative to each station: its own busiest quarter of hours.
  const busyCut = new Map<string, number>();
  const perSite = new Map<string, number[]>();
  for (const f of frame.footfall) {
    if (f.count <= 0) continue;
    const list = perSite.get(f.locationId) ?? [];
    list.push(f.count);
    perSite.set(f.locationId, list);
  }
  for (const [site, counts] of perSite) {
    counts.sort((a, b) => a - b);
    busyCut.set(site, counts[Math.floor(counts.length * 0.75)]);
  }

  const spans = (kind: FrameEvent["kind"]) =>
    frame.events
      .filter((e) => e.kind === kind)
      .map((e) => ({
        from: Date.parse(e.startsAt),
        to: Date.parse(e.endsAt),
        scope: e.locationId ? subtree.get(e.locationId) : null,
      }));
  const disruptions = spans("disruption");
  const works = spans("works");
  const within = (list: ReturnType<typeof spans>, t: number, locationId: string) =>
    list.some((d) => t >= d.from && t < d.to && (!d.scope || d.scope.has(locationId)));

  const toneOf = new Map(frame.question.scale.map((o) => [o.id, o.tone]));
  const rows: Row[] = frame.responses
    .filter((r) => r.valid)
    .map((r) => {
      const siteId = siteOf.get(r.locationId)!;
      const key = hourKey(r.at);
      const weather = weatherByHour.get(key);
      const footfall = footfallBySiteHour.get(`${siteId}|${key}`);
      const service = serviceBySiteHour.get(`${siteId}|${key}`);
      const t = Date.parse(r.at);
      return {
        ...r,
        ...localTime(r.at),
        tone: toneOf.get(r.value) ?? "unknown",
        siteId,
        cond: {
          rain: (weather?.precipMm ?? 0) >= 0.5,
          dark: weather ? weather.isDark : r.afterDark,
          disrupted: within(disruptions, t, r.locationId),
          works: within(works, t, r.locationId),
          busy: footfall != null && footfall >= (busyCut.get(siteId) ?? Infinity),
          late: !!service && service.run > 0 && service.onTime / service.run < 0.8,
        },
      };
    });

  const today = localTime(frame.loadedAt).day;
  return {
    frame,
    config,
    byId,
    byRef,
    children,
    subtree,
    rows,
    today,
    siteOf,
    weatherByHour,
    footfallBySiteHour,
    serviceBySiteHour,
  };
}

export function breadcrumb(ix: Index, id: string): FrameLocation[] {
  const path: FrameLocation[] = [];
  let cur = ix.byId.get(id);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? ix.byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** The location an issue is reported "at": the nearest zone, else the site. */
export function groupingOf(ix: Index, id: string): FrameLocation {
  const path = breadcrumb(ix, id);
  return path.find((l) => l.level === "zone") ?? path[0];
}

export type Range = { from: string; to: string };

export function rangeOf(ix: Index, filters: Filters, defaultDays = 84): Range {
  const to = filters.to ?? ix.today;
  const from = filters.from ?? addDays(to, -(defaultDays - 1));
  return { from, to };
}

export function select(
  ix: Index,
  opts: { range: Range; locationId?: string; segment?: string },
): Row[] {
  const scope = opts.locationId ? ix.subtree.get(opts.locationId) : null;
  return ix.rows.filter(
    (r) =>
      r.day >= opts.range.from &&
      r.day <= opts.range.to &&
      (!scope || scope.has(r.locationId)) &&
      (!opts.segment || r.segment === opts.segment),
  );
}

// ─── Summaries ─────────────────────────────────────────────────────────────

export type CountItem = { id: string; label: string; count: number; tone?: Tone };

export type Summary = {
  n: number;
  people: number;
  clear: number;
  friction: number;
  blocked: number;
  /** Responses that reported any difficulty (friction + blocked). */
  difficulty: number;
  distribution: CountItem[];
  categories: (CountItem & { icon: string; people: number })[];
  severities: CountItem[];
  /** Reports at severity rank ≥ 4 — kept visible however rare. */
  severe: number;
  lowSample: boolean;
};

export function distinctPeople(rows: Row[]): number {
  const keys = new Set<string>();
  let anonymous = 0;
  for (const r of rows) {
    if (r.respondentKey) keys.add(r.respondentKey);
    else anonymous++;
  }
  return keys.size + anonymous;
}

export function summarise(ix: Index, rows: Row[]): Summary {
  const scale = ix.frame.question.scale;
  const byValue = new Map<string, number>();
  let clear = 0,
    friction = 0,
    blocked = 0,
    severe = 0;
  const cat = new Map<string, Row[]>();
  const sev = new Map<string, number>();
  for (const r of rows) {
    byValue.set(r.value, (byValue.get(r.value) ?? 0) + 1);
    if (r.tone === "clear") clear++;
    else if (r.tone === "friction") friction++;
    else if (r.tone === "blocked") blocked++;
    if (r.tone !== "clear" && r.category) {
      const list = cat.get(r.category) ?? [];
      list.push(r);
      cat.set(r.category, list);
    }
    if (r.severity) {
      sev.set(r.severity, (sev.get(r.severity) ?? 0) + 1);
      if ((severityOf(r.severity)?.rank ?? 0) >= 4) severe++;
    }
  }
  return {
    n: rows.length,
    people: distinctPeople(rows),
    clear,
    friction,
    blocked,
    difficulty: friction + blocked,
    distribution: scale.map((o) => ({
      id: o.id,
      label: o.label,
      tone: o.tone,
      count: byValue.get(o.id) ?? 0,
    })),
    categories: ix.config.categories
      .map((c) => ({
        id: c.id,
        label: c.label,
        icon: c.icon,
        count: cat.get(c.id)?.length ?? 0,
        people: distinctPeople(cat.get(c.id) ?? []),
      }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count),
    severities: ix.config.severities.map((s) => ({
      id: s.id,
      label: s.label,
      tone: s.tone,
      count: sev.get(s.id) ?? 0,
    })),
    severe,
    lowSample: rows.length < MIN_SAMPLE,
  };
}

// ─── Time ──────────────────────────────────────────────────────────────────

export type WeekBucket = {
  weekStart: string;
  n: number;
  clear: number;
  friction: number;
  blocked: number;
};

/** Seven-day buckets ending on range.to, oldest first. */
export function weeklyTrend(rows: Row[], range: Range): WeekBucket[] {
  const weeks = Math.ceil((daysBetween(range.from, range.to) + 1) / 7);
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: addDays(range.to, -(weeks - i) * 7 + 1),
    n: 0,
    clear: 0,
    friction: 0,
    blocked: 0,
  }));
  for (const r of rows) {
    const back = Math.floor(daysBetween(r.day, range.to) / 7);
    const b = buckets[weeks - 1 - back];
    if (!b) continue;
    b.n++;
    if (r.tone === "clear") b.clear++;
    else if (r.tone === "friction") b.friction++;
    else if (r.tone === "blocked") b.blocked++;
  }
  return buckets;
}

export type HeatCell = { n: number; difficulty: number };
/** [weekday 0=Mon][hour 0–23] */
export type Heatmap = { cells: HeatCell[][]; maxN: number };

export function heatmap(rows: Row[], predicate: (r: Row) => boolean = (r) => r.tone !== "clear") {
  const cells: HeatCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ n: 0, difficulty: 0 })),
  );
  let maxN = 0;
  for (const r of rows) {
    const c = cells[r.weekday][r.hour];
    c.n++;
    if (predicate(r)) c.difficulty++;
    maxN = Math.max(maxN, c.n);
  }
  return { cells, maxN } satisfies Heatmap;
}

export type SplitRow = { id: string; label: string; n: number; difficulty: number; people: number };

export function segmentSplit(ix: Index, rows: Row[]): SplitRow[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.segment ?? "__none";
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  const order = [...ix.config.segments.map((s) => s.id), "__none"];
  return order
    .filter((id) => groups.has(id))
    .map((id) => {
      const g = groups.get(id)!;
      return {
        id,
        label: id === "__none" ? "Not stated" : labelOf(ix.config.segments, id),
        n: g.length,
        difficulty: g.filter((r) => r.tone !== "clear").length,
        people: distinctPeople(g),
      };
    });
}

export function darkSplit(rows: Row[]): SplitRow[] {
  const day = rows.filter((r) => !r.afterDark);
  const dark = rows.filter((r) => r.afterDark);
  const row = (id: string, label: string, g: Row[]): SplitRow => ({
    id,
    label,
    n: g.length,
    difficulty: g.filter((r) => r.tone !== "clear").length,
    people: distinctPeople(g),
  });
  return [row("day", "Daylight", day), row("dark", "After dark", dark)];
}

/** Rows that fall inside / outside any of the given events. */
export function eventSplit(
  ix: Index,
  rows: Row[],
  events: FrameEvent[],
  labels: [string, string],
): SplitRow[] {
  const spans = events.map((e) => ({
    from: Date.parse(e.startsAt),
    to: Date.parse(e.endsAt),
    scope: e.locationId ? ix.subtree.get(e.locationId) : null,
  }));
  const inside: Row[] = [];
  const outside: Row[] = [];
  for (const r of rows) {
    const t = Date.parse(r.at);
    const hit = spans.some(
      (s) => t >= s.from && t < s.to && (!s.scope || s.scope.has(r.locationId)),
    );
    (hit ? inside : outside).push(r);
  }
  const row = (id: string, label: string, g: Row[]): SplitRow => ({
    id,
    label,
    n: g.length,
    difficulty: g.filter((r) => r.tone !== "clear").length,
    people: distinctPeople(g),
  });
  return [row("in", labels[0], inside), row("out", labels[1], outside)];
}

// ─── Exposure and coverage ─────────────────────────────────────────────────

export type Evidence = {
  responses: number;
  people: number;
  exposure: number;
  /** Leaves (where people answer) in scope, and how many reached MIN_SAMPLE. */
  leaves: number;
  leavesCovered: number;
  range: Range;
};

export function evidence(ix: Index, rows: Row[], range: Range, locationId?: string): Evidence {
  const scope = locationId ? ix.subtree.get(locationId)! : null;
  const leaves = ix.frame.locations.filter(
    (l) => (ix.children.get(l.id)?.length ?? 0) === 0 && (!scope || scope.has(l.id)),
  );
  const perLeaf = new Map<string, number>();
  for (const r of rows) perLeaf.set(r.locationId, (perLeaf.get(r.locationId) ?? 0) + 1);
  let exposure = 0;
  for (const e of ix.frame.exposure) {
    if (e.day < range.from || e.day > range.to) continue;
    if (scope && !scope.has(e.locationId)) continue;
    exposure += e.count;
  }
  return {
    responses: rows.length,
    people: distinctPeople(rows),
    exposure,
    leaves: leaves.length,
    leavesCovered: leaves.filter((l) => (perLeaf.get(l.id) ?? 0) >= MIN_SAMPLE).length,
    range,
  };
}

// ─── Problem rows ──────────────────────────────────────────────────────────

const SEVERITY_WEIGHT = [0, 1, 2, 4, 6, 8];

/** Report rate inside a condition vs outside it, with the counts behind both. */
export type ConditionLift = {
  ratio: number;
  inReports: number;
  inAnswers: number;
  outReports: number;
  outAnswers: number;
};

export type ProblemRow = {
  key: string;
  location: { id: string; ref: string; label: string; path: string[] };
  category: Category;
  reports: number;
  people: number;
  /** All answers at this location in the period — the denominator. */
  answers: number;
  rate: number;
  /** Reports by local hour, 0–23. */
  hours: number[];
  /** Share of reports on Mon–Fri. */
  weekdayShare: number;
  /** The access-need group behind most reports, when one group is ≥ half of them. */
  group: { id: string; label: string; reports: number; of: number } | null;
  worst: Severity | null;
  weight: number;
  thinEvidence: boolean;
  /** This location's rate for the problem ÷ the network's. */
  lift: number;
  /** Only conditions where the rate is ≥ 1.5× higher inside, on enough answers. */
  context: Record<Condition, ConditionLift | null>;
  quotes: string[];
  issue: { id: string; status: string; owner: string | null } | null;
};

/** @deprecated kept for older call sites; same shape. */
export type AttentionItem = ProblemRow;

export type ProblemQuery = { range: Range; segment?: string; category?: string; within?: string };

/**
 * Location × problem rows for the period, most pressing first. Ranking weights
 * each report by severity, so ten minor grumbles don't outrank four people who
 * couldn't board.
 *
 * A row is listed when ATTENTION_MIN_PEOPLE distinct people report the problem
 * at ATTENTION_MIN_LIFT× the network's rate — background grumbling that happens
 * everywhere isn't a location problem — or when any report is severe.
 */
export function problemRows(ix: Index, q: ProblemQuery): ProblemRow[] {
  const network = select(ix, { range: q.range });
  const within = q.within ? ix.subtree.get(q.within) : null;
  // Scoped to a location: only its answers. Below area level (a single stand),
  // rows group at that location rather than its area.
  const window = within ? network.filter((r) => within.has(r.locationId)) : network;
  const scoped = q.segment ? window.filter((r) => r.segment === q.segment) : window;
  const groupAt = (locationId: string): FrameLocation => {
    const g = groupingOf(ix, locationId);
    return within && !within.has(g.id) ? ix.byId.get(q.within!)! : g;
  };
  // The network's rate per problem is the yardstick, whatever the scope.
  const networkScoped = q.segment ? network.filter((r) => r.segment === q.segment) : network;

  const byGroup = (rows: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const g = groupAt(r.locationId).id;
      const list = m.get(g) ?? [];
      list.push(r);
      m.set(g, list);
    }
    return m;
  };
  const atGroup = byGroup(window);
  const atGroupScoped = byGroup(scoped);
  const networkCat = new Map<string, number>();
  for (const r of networkScoped) {
    if (r.tone !== "clear" && r.category) {
      networkCat.set(r.category, (networkCat.get(r.category) ?? 0) + 1);
    }
  }

  const groups = new Map<string, { loc: FrameLocation; cat: string; rows: Row[] }>();
  for (const r of scoped) {
    if (r.tone === "clear" || !r.category) continue;
    if (q.category && r.category !== q.category) continue;
    const loc = groupAt(r.locationId);
    const key = `${loc.id}:${r.category}`;
    const g = groups.get(key) ?? { loc, cat: r.category, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }

  const out: ProblemRow[] = [];
  for (const [key, g] of groups) {
    const category = ix.config.categories.find((c) => c.id === g.cat);
    if (!category) continue;
    const people = distinctPeople(g.rows);
    const ranks = g.rows.map((r) => severityOf(r.severity)?.rank ?? 1);
    const worstRank = Math.max(...ranks);
    const here = atGroupScoped.get(g.loc.id) ?? [];
    const answers = here.length;
    const networkRate = (networkCat.get(g.cat) ?? 0) / Math.max(1, networkScoped.length);
    const lift = answers && networkRate ? g.rows.length / answers / networkRate : 0;
    const standsOut = people >= ATTENTION_MIN_PEOPLE && lift >= ATTENTION_MIN_LIFT;
    if (!standsOut && worstRank < 4) continue;

    const isReport = (r: Row) => r.tone !== "clear" && r.category === g.cat;
    const hours = Array.from({ length: 24 }, () => 0);
    for (const r of g.rows) hours[r.hour]++;
    const context = {} as Record<Condition, ConditionLift | null>;
    for (const c of CONDITIONS) context[c.id] = conditionLift(here, (r) => r.cond[c.id], isReport);
    const issue =
      ix.frame.issues.find(
        (i) => i.category === g.cat && ix.subtree.get(g.loc.id)?.has(i.locationId),
      ) ?? null;

    out.push({
      key,
      location: {
        id: g.loc.id,
        ref: g.loc.ref,
        label: g.loc.label,
        path: breadcrumb(ix, g.loc.id).map((l) => l.label),
      },
      category,
      reports: g.rows.length,
      people,
      answers,
      rate: answers ? g.rows.length / answers : 0,
      hours,
      weekdayShare: g.rows.filter((r) => r.weekday < 5).length / g.rows.length,
      group: topGroup(ix, g.rows, atGroup.get(g.loc.id) ?? []),
      worst: ix.config.severities.find((s) => s.rank === worstRank) ?? null,
      weight: ranks.reduce((sum, k) => sum + SEVERITY_WEIGHT[k], 0),
      thinEvidence: people < ATTENTION_MIN_PEOPLE,
      lift,
      context,
      quotes: [
        ...new Set(
          g.rows
            .filter((r) => r.comment)
            .sort(
              (a, b) => (severityOf(b.severity)?.rank ?? 0) - (severityOf(a.severity)?.rank ?? 0),
            )
            .map((r) => r.comment!),
        ),
      ].slice(0, 3),
      issue: issue ? { id: issue.id, status: issue.status, owner: issue.owner } : null,
    });
  }
  // Resolved issues drop to the bottom: they are being remeasured, not acted on.
  const settled = (i: ProblemRow) => (i.issue?.status === "resolved" ? 1 : 0);
  return out.sort((a, b) => settled(a) - settled(b) || b.weight - a.weight);
}

/** The last ATTENTION_WINDOW_DAYS — the default window for "what's live now". */
export function attentionQueue(ix: Index, filters: Filters): ProblemRow[] {
  const to = filters.to ?? ix.today;
  const range = { from: addDays(to, -(ATTENTION_WINDOW_DAYS - 1)), to };
  return problemRows(ix, { range, segment: filters.segment });
}

const MIN_INSIDE_ANSWERS = 10;
const MIN_INSIDE_REPORTS = 3;
const MIN_RATIO = 1.5;

/** Rate inside vs outside a condition — null unless clearly higher on enough answers. */
export function conditionLift(
  rows: Row[],
  inside: (r: Row) => boolean,
  isReport: (r: Row) => boolean,
): ConditionLift | null {
  let inA = 0,
    inR = 0,
    outA = 0,
    outR = 0;
  for (const r of rows) {
    if (inside(r)) {
      inA++;
      if (isReport(r)) inR++;
    } else {
      outA++;
      if (isReport(r)) outR++;
    }
  }
  if (inA < MIN_INSIDE_ANSWERS || inR < MIN_INSIDE_REPORTS || outA === 0) return null;
  const rateIn = inR / inA;
  const rateOut = outR / outA;
  const ratio = rateOut === 0 ? Infinity : rateIn / rateOut;
  if (ratio < MIN_RATIO) return null;
  return { ratio, inReports: inR, inAnswers: inA, outReports: outR, outAnswers: outA };
}

function topGroup(ix: Index, reports: Row[], all: Row[]): ProblemRow["group"] {
  const bySeg = new Map<string, number>();
  for (const r of reports) if (r.segment) bySeg.set(r.segment, (bySeg.get(r.segment) ?? 0) + 1);
  const top = [...bySeg].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[0] === "none" || top[1] / reports.length < 0.5) return null;
  const reporters = new Set(
    reports.filter((r) => r.segment === top[0]).map((r) => r.respondentKey ?? r.id),
  );
  const people = new Set(
    all.filter((r) => r.segment === top[0]).map((r) => r.respondentKey ?? r.id),
  );
  return {
    id: top[0],
    label: labelOf(ix.config.segments, top[0]),
    reports: reporters.size,
    of: people.size,
  };
}

// ─── Conditions, network-wide ──────────────────────────────────────────────

export type ConditionRow = {
  id: Condition;
  label: string;
  inside: { label: string; answers: number; reports: number };
  outside: { label: string; answers: number; reports: number };
};

export function conditionTable(rows: Row[]): ConditionRow[] {
  return CONDITIONS.map((c) => {
    const inside = rows.filter((r) => r.cond[c.id]);
    const outside = rows.filter((r) => !r.cond[c.id]);
    const reports = (g: Row[]) => g.filter((r) => r.tone !== "clear").length;
    return {
      id: c.id,
      label: c.label,
      inside: { label: c.inside, answers: inside.length, reports: reports(inside) },
      outside: { label: c.outside, answers: outside.length, reports: reports(outside) },
    };
  });
}

// ─── Daily series with context lanes ───────────────────────────────────────

export type DayPoint = {
  day: string;
  answers: number;
  reports: number;
  rainMm: number;
  tempMax: number | null;
  boardings: number;
  /** Share of buses on time, 0–1, or null with no service data. */
  onTime: number | null;
  disruption: boolean;
  works: boolean;
};

/**
 * One point per day: problem reports and answers in scope, alongside the
 * day's weather, footfall, punctuality and any disruption or works.
 */
export function dailySeries(
  ix: Index,
  q: { range: Range; locationId?: string; category?: string; segment?: string },
): DayPoint[] {
  const days: string[] = [];
  for (let d = q.range.from; d <= q.range.to; d = addDays(d, 1)) days.push(d);
  const at = new Map(
    days.map((d) => [
      d,
      {
        day: d,
        answers: 0,
        reports: 0,
        rainMm: 0,
        tempMax: null as number | null,
        boardings: 0,
        onTimeN: 0,
        runN: 0,
        disruption: false,
        works: false,
      },
    ]),
  );
  const scope = q.locationId ? ix.subtree.get(q.locationId) : null;
  const sites = q.locationId
    ? new Set([ix.siteOf.get(q.locationId)!])
    : new Set((ix.children.get(null) ?? []).map((s) => s.id));

  for (const r of select(ix, { range: q.range, locationId: q.locationId, segment: q.segment })) {
    const p = at.get(r.day);
    if (!p) continue;
    p.answers++;
    if (r.tone !== "clear" && (!q.category || r.category === q.category)) p.reports++;
  }
  for (const w of ix.frame.weather) {
    const p = at.get(localTime(w.hour).day);
    if (!p) continue;
    p.rainMm += w.precipMm;
    p.tempMax = p.tempMax == null ? w.tempC : Math.max(p.tempMax, w.tempC);
  }
  for (const f of ix.frame.footfall) {
    if (!sites.has(f.locationId)) continue;
    const p = at.get(localTime(f.hour).day);
    if (p) p.boardings += f.count;
  }
  for (const s of ix.frame.service) {
    if (!sites.has(s.locationId)) continue;
    const p = at.get(localTime(s.hour).day);
    if (!p) continue;
    p.onTimeN += s.onTime;
    p.runN += s.run;
  }
  // An event applies if it's network-wide, inside the scope, or on one of its parents.
  const ancestors = q.locationId ? new Set(breadcrumb(ix, q.locationId).map((l) => l.id)) : null;
  for (const e of ix.frame.events) {
    if (e.kind === "weather") continue;
    const applies =
      !e.locationId || !scope || scope.has(e.locationId) || ancestors!.has(e.locationId);
    if (!applies) continue;
    for (let d = localTime(e.startsAt).day; d <= localTime(e.endsAt).day; d = addDays(d, 1)) {
      const p = at.get(d);
      if (!p) continue;
      if (e.kind === "disruption") p.disruption = true;
      else p.works = true;
    }
  }
  return days.map((d) => {
    const p = at.get(d)!;
    return {
      day: p.day,
      answers: p.answers,
      reports: p.reports,
      rainMm: Math.round(p.rainMm * 10) / 10,
      tempMax: p.tempMax == null ? null : Math.round(p.tempMax * 10) / 10,
      boardings: p.boardings,
      onTime: p.runN ? p.onTimeN / p.runN : null,
      disruption: p.disruption,
      works: p.works,
    };
  });
}

// ─── Before / after an intervention ────────────────────────────────────────

export type BeforeAfter = {
  interventionDay: string;
  before: { n: number; reports: number; days: number };
  after: { n: number; reports: number; days: number };
  weekly: { weekStart: string; n: number; reports: number; after: boolean }[];
};

/**
 * Reports of the issue's category at its location, before vs after the
 * intervention. Equal-length windows where the data allows, so a busier
 * "before" period doesn't flatter the "after".
 */
export function beforeAfter(ix: Index, issue: FrameIssue): BeforeAfter | null {
  if (!issue.interventionAt) return null;
  const day = localTime(issue.interventionAt).day;
  const afterDays = Math.max(1, daysBetween(day, ix.today) + 1);
  const span = Math.min(afterDays, 42);
  const beforeRange = { from: addDays(day, -span), to: addDays(day, -1) };
  const afterRange = { from: day, to: addDays(day, span - 1) };
  const scope = ix.subtree.get(issue.locationId) ?? new Set([issue.locationId]);
  const at = ix.rows.filter((r) => scope.has(r.locationId));
  const isReport = (r: Row) => r.tone !== "clear" && r.category === issue.category;
  const count = (range: Range) => {
    const g = at.filter((r) => r.day >= range.from && r.day <= range.to);
    return { n: g.length, reports: g.filter(isReport).length, days: span };
  };
  const trendRange = { from: addDays(day, -span), to: afterRange.to };
  const weeks = weeklyTrend([], trendRange).map((w) => ({
    weekStart: w.weekStart,
    n: 0,
    reports: 0,
    after: w.weekStart >= day,
  }));
  for (const r of at) {
    if (r.day < trendRange.from || r.day > trendRange.to) continue;
    const back = Math.floor(daysBetween(r.day, trendRange.to) / 7);
    const w = weeks[weeks.length - 1 - back];
    if (!w) continue;
    w.n++;
    if (isReport(r)) w.reports++;
  }
  return {
    interventionDay: day,
    before: count(beforeRange),
    after: count(afterRange),
    weekly: weeks,
  };
}
