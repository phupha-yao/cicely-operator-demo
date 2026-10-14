/**
 * Small shared pieces for the operator surface.
 *
 * Two rules live here rather than in each page: every figure carries its
 * denominator ("9 of 26"), and colour never carries meaning alone — each tone
 * is also named in words.
 */
import type { ReactNode } from "react";
import type { Tone } from "@/lib/tenant-config";
import {
  Accessibility,
  Armchair,
  Bus,
  Circle,
  DoorClosed,
  HandHelping,
  Lightbulb,
  Monitor,
  Signpost,
  Users,
  Volume2,
  type LucideIcon,
} from "lucide-react";

export const TONE_FILL: Record<Tone, string> = {
  clear: "bg-[var(--data-ok)]",
  friction: "bg-[var(--data-warn)]",
  blocked: "bg-[var(--data-blocked)]",
  unknown: "bg-[var(--data-none)]",
};

export const TONE_WORD: Record<Tone, string> = {
  clear: "No difficulty",
  friction: "Some difficulty",
  blocked: "Couldn't do it unaided",
  unknown: "Unclear",
};

const ICONS: Record<string, LucideIcon> = {
  signpost: Signpost,
  accessibility: Accessibility,
  bus: Bus,
  monitor: Monitor,
  "volume-2": Volume2,
  armchair: Armchair,
  lightbulb: Lightbulb,
  users: Users,
  "hand-helping": HandHelping,
  "door-closed": DoorClosed,
};

export function CategoryIcon({ name, className = "size-4" }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Circle;
  return <Icon aria-hidden="true" className={className} />;
}

export function fmt(n: number): string {
  return n.toLocaleString("en-GB");
}

/** "9 of 26" — the only way a proportion is expressed on this surface. */
export function OfN({ n, of, strong = true }: { n: number; of: number; strong?: boolean }) {
  return (
    <span className={strong ? "font-display font-semibold text-ink" : undefined}>
      {fmt(n)} <span className="font-sans font-normal text-ink/70">of</span> {fmt(of)}
    </span>
  );
}

export function Card({
  eyebrow,
  title,
  sub,
  right,
  children,
  id,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <section aria-labelledby={id} className="rounded-[10px] border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-3.5">
        <div>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2
            id={id}
            className={`font-display text-[0.9375rem] leading-snug text-ink ${eyebrow ? "mt-1" : ""}`}
          >
            {title}
          </h2>
          {sub && <p className="mt-0.5 text-[0.75rem] text-ink/70">{sub}</p>}
        </div>
        {right}
      </div>
      {children && <div className="px-5 py-4">{children}</div>}
    </section>
  );
}

/** Horizontal count bars, each with its number and label in text. */
export function CountBars({
  items,
  total,
}: {
  items: { id: string; label: ReactNode; count: number; tone?: Tone; icon?: string }[];
  total: number;
}) {
  const shown = items.filter((i) => i.count > 0);
  if (shown.length === 0) {
    return <p className="text-[0.8125rem] text-ink/70">Nothing reported in this period.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {shown.map((c) => (
        <li key={c.id} className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-right font-display text-sm font-semibold tabular-nums text-ink">
            {fmt(c.count)}
          </span>
          <span className="flex h-3 flex-1 overflow-hidden rounded-full bg-ink/10">
            <span
              className={`h-full rounded-full ring-1 ring-inset ring-black/25 ${
                c.tone ? TONE_FILL[c.tone] : "bg-[var(--data-reports)]"
              }`}
              style={{
                width: total > 0 ? `${(c.count / total) * 100}%` : 0,
                minWidth: c.count > 0 ? "0.5rem" : 0,
              }}
            />
          </span>
          <span className="flex w-[52%] shrink-0 items-center gap-1.5 text-[0.8125rem] leading-tight text-ink/85">
            {c.icon && <CategoryIcon name={c.icon} className="size-3.5 shrink-0" />}
            {c.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Rows comparing groups: "difficulty of n" with a proportional bar. */
export function SplitTable({
  rows,
  caption,
  minSample,
}: {
  rows: { id: string; label: string; n: number; difficulty: number; people?: number }[];
  caption: string;
  minSample: number;
}) {
  const max = Math.max(...rows.map((r) => (r.n ? r.difficulty / r.n : 0)), 0.0001);
  return (
    <table className="w-full text-[0.8125rem]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="bg-surface-2 text-left text-[0.6875rem] uppercase tracking-wider text-ink/70 [&>th]:py-2 [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md">
          <th scope="col" className="pb-2 font-semibold">
            Group
          </th>
          <th scope="col" className="pb-2 text-right font-semibold">
            Reported difficulty
          </th>
          <th scope="col" className="w-[38%] pb-2">
            <span className="sr-only">Relative bar</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const thin = r.n < minSample;
          return (
            <tr key={r.id} className={`border-t border-ink/8 ${thin ? "opacity-60" : ""}`}>
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                {r.label}
              </th>
              <td className="py-1.5 pr-3 text-right tabular-nums">
                <OfN n={r.difficulty} of={r.n} strong={!thin} />
                {thin && <span className="ml-1 text-[0.6875rem]">(few responses)</span>}
              </td>
              <td className="py-1.5">
                <span className="block h-2.5 overflow-hidden rounded-full bg-ink/8">
                  <span
                    className="block h-full rounded-full bg-[var(--data-reports)]"
                    style={{ width: `${r.n ? (r.difficulty / r.n / max) * 100 : 0}%` }}
                  />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Exact figures and reasoning, one click away (GOV.UK "Details" pattern). */
export function HowWeKnow({
  children,
  label = "How we know",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <details className="group mt-2 text-[0.8125rem] text-ink/80">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-[0.75rem] font-semibold text-ink/70 underline decoration-ink/30 underline-offset-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
        {label}
      </summary>
      <div className="mt-2 space-y-1">{children}</div>
    </details>
  );
}

/** Small upper-case label above an insight title. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-ink/70">
      {children}
    </p>
  );
}

export function Caveat({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[0.75rem] text-ink/75">{children}</p>
  );
}

export function StatusPill({ status }: { status: string }) {
  const label: Record<string, string> = {
    new: "New",
    investigating: "Investigating",
    action_planned: "Action planned",
    monitoring: "Monitoring",
    resolved: "Resolved",
  };
  // Brand tints as fills, ink text on all of them (≥6:1).
  const style: Record<string, string> = {
    new: "bg-bubblegum",
    investigating: "bg-sky",
    action_planned: "bg-[var(--tint-orange)]",
    monitoring: "bg-dandelion",
    resolved: "bg-mint",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold text-ink ${
        style[status] ?? style.investigating
      }`}
    >
      {label[status] ?? status}
    </span>
  );
}

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
