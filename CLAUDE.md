# CLAUDE.md

## What this is

**Cicely operator dashboard** — a demo of what Cicely shows the operator of physical spaces:
where and when people find those spaces hard to use, for whom, and whether a fix helped. The
first demo is a bus franchise (stations → areas → stands), on **synthetic data**.

It was started as a fresh repo from the InPost locker study (`scout-ioe-handoff`), keeping only
its app shell, auth and visual style. Nothing here talks to the InPost project, and no
participant data came across. Keep it that way: the generator refuses the InPost project URL.

## Commands

```bash
supabase start                      # local stack on 553xx ports (another project may own 543xx)
supabase migration up --local       # apply new migrations without wiping auth users (avoid db reset)
npm run dev                          # http://localhost:8081
npm test                             # node --test: derivation rules + the demo story across seeds
npm run typecheck && npm run lint
npm run demo:generate -- --dry-run   # build the demo in memory and print the story checks
npm run demo:generate                # (re)write it to the project in .env — replaces the org
npm run demo:admin -- <email> <password>   # create/re-grant a dashboard admin
supabase gen types typescript --local > src/integrations/supabase/types.ts   # after schema changes
```

`.env` holds the local stack's fixed default keys (also in `.env.example`). The server caches
the loaded data for 60s (`frame.server.ts`), so after regenerating, give it a minute or restart.

## Deployment (Vercel + hosted Supabase)

- **Live:** https://cicely-operator-demo.vercel.app (Vercel project `phupha-yaos-projects/cicely-operator-demo`).
- **Database:** Supabase project `cicely-operator-demo` (ref `zfnxbvjqxnzyhvboxafm`, org "Demo", London).
  Credentials live only in the gitignored `.env.hosted`.
- **Deploy:** `npm run deploy` (= `vercel deploy --prod`, which **builds on Vercel**). Don't use
  `vercel build` + `--prebuilt`: the env vars are Vercel *sensitive* vars, which `vercel pull`
  returns blank, so a local build ships a client with no Supabase URL. `.vercelignore` keeps
  `.env*` out of the upload.
- **Schema changes:** `supabase db push` (linked to the hosted project), then
  `npm run demo:generate:hosted`. **Admin users:** `npm run demo:admin:hosted -- <email> <password>`.
- Vercel env (production): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (legacy service_role JWT —
  the new `sb_secret_` key returned by the CLI was rejected), `SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `DEMO_ORG_NAME` ("Bus Network").
- `@tanstack/react-start` must stay ≥ 1.168.60 (Vercel blocks older versions for CVE-2026-102989).

## Architecture

TanStack Start (React 19) + TanStack Router/Query + Supabase + Tailwind v4, same shell as the
source repo (`vite.config.ts` wrapper bundles the plugins — don't add them again).

- **Data model** (`supabase/migrations/…_operator_schema.sql`): `organisations` → `locations`
  (self-referencing tree, `level` site | zone | point) → `responses` (one short answer per person,
  per point, per moment, with optional `segment`, `issue_category`, `severity`, `comment`).
  Plus `exposure_daily` (denominator), `context_events` (weather / disruption / works), `issues`
  (the detect → assign → intervene → remeasure log), `questions`, `user_roles`.
- **Flow**: server fn (`src/lib/operator.functions.ts`) → `adminDb()` gate
  (`admin-auth.server.ts`) → `loadIndex()` loads the whole org frame once
  (`frame.server.ts`, paged past PostgREST's 1,000-row cap) → pure reducers in
  **`src/lib/derive.ts`** → plain view models. Put new logic in `derive.ts` and test it there.
- **Sector config** (`src/lib/tenant-config.ts`): vocabulary (stand / rider / boarding), segments,
  issue taxonomy + icons, severity scale, thresholds. Pages never hard-code bus words.
- **Context feeds** (migration `…_context_feeds.sql`): `weather_hourly` (network), `footfall_hourly`
  and `service_hourly` (per station). `indexFrame` joins each response to its hour and sets
  `row.cond` = rain / dark / disrupted / works / busy / late. `problemRows`, `conditionLift`,
  `conditionTable` and `dailySeries` in `derive.ts` build the tables and timeline lanes.
- **Formatting** (`src/lib/patterns.ts`, tested): `pct`, `ratio`, `hotspot`, `peakRuns`, `peakLabel`.
- **Pages** (`src/routes/_authenticated/admin.*`): Overview (KPIs + problems table + stations),
  Locations (+ `$ref` for any level, `?problem=` to focus), Context (timeline lanes, conditions,
  events), Issues, Method. Filters (`site`, `problem`, `segment`, `weeks`) live in the URL
  (`src/lib/filters.ts`, validated on the `admin` layout route; links pass `search={true}`).
- **Demo data**: `scripts/demo-story.ts` (pure `buildDemo({ seed, today })`) and
  `scripts/generate-demo.ts` (writes it). `src/lib/derive.test.ts` asserts the story holds
  across seeds — run it after touching either.

## Rules the UI keeps

- **Structured data, no generated prose.** Pages show tables, timelines, heatmaps and labelled
  numbers across four dimensions — location, time, problem, operational/environmental context.
  No sentence-style insights or recommendations; the operator draws the conclusion.
- Rates are shown as % with their counts one hover away ("17 of 355 answers"). No composite score.
- Problem rows: 3+ people at 2×+ the network rate for that problem, or any report severe enough to
  stop independent travel. Condition columns (▲ ratio) appear only at 1.5×+ with 3+ reports and
  10+ answers inside the condition.
- Fewer than `MIN_SAMPLE` answers: faded/hatched, never hidden. Conditions are labelled
  "coincidence, not cause".
- Colour never carries meaning alone; every chart has a table toggle.
- The header shows **"Illustrative data"**. Never put real findings in this deployment.

## Visual design

Cicely brand, refined for an app (tokens in `src/styles.css`): ink `#1F1F1F` on cream `#FFFBEC`,
never pure black/white; PP Mori Semibold for titles and KPI numbers, Inclusive Sans elsewhere.
Brand tints (mint, dandelion, bubblegum, sky, orange…) are only fills with ink text — status
pills, condition chips, the demo badge. Chart marks use the darker `--data-*` shades, each ≥3:1 on
cream; secondary text is `text-ink/70` or stronger (4.5:1). The segmented `brand-strip` appears
once, on the app bar. Shell: `src/components/operator/AppBar.tsx`; page titles via `PageHeader`.
`public/fonts/PPMori-Semibold.otf` ships with the app (Cicely's licence covers web use, per the user, 2026-10-14).

## Prospect branding

`DEMO_ORG_NAME` (env) overrides the organisation name at load time and in the generator. Put the
prospect's real name only in your local `.env`, never in committed files.

## Decision-making

For important architecture, product or design decisions, present the user with at least two
options and wait for their confirmation.
