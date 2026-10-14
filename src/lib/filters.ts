/**
 * Dashboard filters live in the URL so any view can be shared or bookmarked
 * exactly as seen. Parsed leniently: a bad value is dropped, not an error.
 */
export type DashboardSearch = {
  weeks?: 4 | 12;
  segment?: string;
  /** Station (site ref) */
  site?: string;
  /** Problem (category id) */
  problem?: string;
};

const ID = /^[a-z_]{1,40}$/;
const REF = /^[A-Za-z0-9._-]{1,80}$/;

export function parseDashboardSearch(raw: Record<string, unknown>): DashboardSearch {
  const out: DashboardSearch = {};
  const weeks = Number(raw.weeks);
  if (weeks === 4 || weeks === 12) out.weeks = weeks;
  if (typeof raw.segment === "string" && ID.test(raw.segment)) out.segment = raw.segment;
  if (typeof raw.site === "string" && REF.test(raw.site)) out.site = raw.site;
  if (typeof raw.problem === "string" && ID.test(raw.problem)) out.problem = raw.problem;
  return out;
}
