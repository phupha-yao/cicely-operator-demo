/**
 * Sector vocabulary and taxonomy for the operator dashboard.
 *
 * The database stores ids (segment, issue_category, severity, location kind);
 * this module turns them into words. A new sector is a new entry in
 * SECTOR_CONFIGS — no page should hard-code "stand", "rider" or "bus".
 *
 * Kept free of `@/` imports and runtime-only TypeScript so the generator script
 * and `node --test` can load it directly.
 */

export type Tone = "clear" | "friction" | "blocked" | "unknown";

export type Labelled = { id: string; label: string };

export type Category = Labelled & {
  /** lucide-react icon name, resolved in src/components/operator/primitives.tsx */
  icon: string;
  /** Two-to-four-word problem for one-line lists: "No audio announcements". */
  short: string;
};

export type Severity = Labelled & {
  /** 1 = least severe. Drives ranking weight and tone. */
  rank: number;
  tone: Tone;
};

/** `group` is the plural noun used in table labels: "wheelchair users". */
export type Segment = Labelled & { group: string };

export type SectorConfig = {
  sector: string;
  /** Shown under the organisation name in the app bar: "Bus network". */
  name: string;
  levels: { site: Plural; zone: Plural; point: Plural };
  respondent: Plural;
  /** What exposure counts — the response-rate denominator. */
  exposure: Plural;
  segments: Segment[];
  categories: Category[];
  severities: Severity[];
  /** Location `kind` → human label. */
  kinds: Record<string, string>;
};

export type Plural = { one: string; many: string };

/**
 * Evidence thresholds. Below MIN_SAMPLE a figure is shown faded with its count,
 * never hidden and never turned into a rate. ATTENTION_MIN_PEOPLE gates the
 * "needs attention" queue so one person's report can't top it — though a
 * single severe report is still listed (see derive.ts).
 */
export const MIN_SAMPLE = 5;
export const ATTENTION_MIN_PEOPLE = 3;
export const ATTENTION_MIN_LIFT = 2;
export const ATTENTION_WINDOW_DAYS = 28;
export const TIME_ZONE = "Europe/London";

/** Shared across sectors: the severity scale is the InPost study's q17. */
export const SEVERITIES: Severity[] = [
  { id: "minor_inconvenience", label: "Minor inconvenience", rank: 1, tone: "friction" },
  { id: "noticeable_difficulty", label: "Noticeable difficulty", rank: 2, tone: "friction" },
  { id: "serious_barrier", label: "Serious barrier", rank: 3, tone: "blocked" },
  {
    id: "would_prevent_independent_use",
    label: "Would prevent independent use",
    rank: 4,
    tone: "blocked",
  },
  { id: "would_prevent_use_at_all", label: "Would prevent use at all", rank: 5, tone: "blocked" },
];

const BUS: SectorConfig = {
  sector: "bus",
  name: "Bus network",
  levels: {
    site: { one: "station", many: "stations" },
    zone: { one: "area", many: "areas" },
    point: { one: "stand", many: "stands" },
  },
  respondent: { one: "rider", many: "riders" },
  exposure: { one: "boarding", many: "boardings" },
  segments: [
    {
      id: "wheelchair",
      label: "Wheelchair user",
      group: "wheelchair users",
    },
    {
      id: "mobility",
      label: "Mobility impairment",
      group: "riders with limited mobility",
    },
    {
      id: "blind_ps",
      label: "Blind or partially sighted",
      group: "blind and partially sighted riders",
    },
    {
      id: "deaf_hoh",
      label: "Deaf or hard of hearing",
      group: "Deaf and hard of hearing riders",
    },
    {
      id: "neurodivergent",
      label: "Neurodivergent",
      group: "neurodivergent riders",
    },
    { id: "older", label: "Older rider (70+)", group: "riders over 70" },
    {
      id: "pushchair",
      label: "With a pushchair or young children",
      group: "riders with pushchairs",
    },
    {
      id: "none",
      label: "No access needs",
      group: "riders with no access needs",
    },
  ],
  categories: [
    {
      id: "finding_stop",
      label: "Finding the right stand or stop",
      icon: "signpost",
      short: "Hard to find the stand",
    },
    {
      id: "step_free_route",
      label: "Step-free route",
      icon: "accessibility",
      short: "No step-free route",
    },
    {
      id: "boarding",
      label: "Boarding and kerb height",
      icon: "bus",
      short: "Hard to board",
    },
    {
      id: "realtime_info",
      label: "Real-time display",
      icon: "monitor",
      short: "Screens hard to read",
    },
    {
      id: "audio_announcements",
      label: "Audio announcements",
      icon: "volume-2",
      short: "No audio announcements",
    },
    {
      id: "seating_shelter",
      label: "Seating and shelter",
      icon: "armchair",
      short: "No seats or shelter",
    },
    {
      id: "lighting_safety",
      label: "Lighting and feeling safe",
      icon: "lightbulb",
      short: "Feels unsafe",
    },
    {
      id: "crowding",
      label: "Crowding",
      icon: "users",
      short: "Too crowded",
    },
    {
      id: "staff_help",
      label: "Getting help from staff",
      icon: "hand-helping",
      short: "No staff to help",
    },
    {
      id: "facilities",
      label: "Toilets and facilities",
      icon: "door-closed",
      short: "Toilets unusable",
    },
  ],
  severities: SEVERITIES,
  kinds: {
    bus_station: "Bus station",
    interchange: "Interchange",
    corridor: "Stop corridor",
    entrance: "Entrance",
    concourse: "Concourse",
    travel_shop: "Travel shop",
    waiting_room: "Waiting room",
    toilets: "Toilets",
    stand_group: "Stand group",
    stand: "Stand",
    stop_pair: "Stop pair",
    stop: "Stop",
  },
};

export const SECTOR_CONFIGS: Record<string, SectorConfig> = { bus: BUS };

export function sectorConfig(sector: string): SectorConfig {
  const config = SECTOR_CONFIGS[sector];
  if (!config) throw new Error(`No sector config for "${sector}"`);
  return config;
}

export function labelOf(list: Labelled[], id: string | null | undefined): string {
  if (!id) return "Not stated";
  return list.find((x) => x.id === id)?.label ?? id;
}

export function severityOf(id: string | null | undefined): Severity | null {
  if (!id) return null;
  return SEVERITIES.find((s) => s.id === id) ?? null;
}
