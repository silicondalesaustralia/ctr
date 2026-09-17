# CTR Warmup / Browser Setup — Current State

Last updated: 2026-09-17

## Goal

Warm Australian GoLogin/Orbita identities through Premium Ports residential proxies until they are campaign-eligible, without Google `sorry` / CAPTCHA blocks.

Eligibility (defaults):

- Age ≥ `WARMUP_MIN_DAYS` (4)
- ≥ `WARMUP_BENIGN_SITE_CLICKS` (2) successful SERP → site clicks
- Graduation SERP inspect passed

---

## Runtime stack

| Layer | Current setting |
|-------|-----------------|
| Browser profiles | GoLogin (`BROWSER_PROFILE_PROVIDER=gologin`) |
| Browser runtime | Local Orbita on Railway worker (`GOLOGIN_BROWSER_RUNTIME=orbita`) |
| Display | Headful via Xvfb (`GOLOGIN_HEADLESS=false`) |
| Proxy | Premium Ports sticky AU residential (`PROXY_PROVIDER=premiumports`) |
| Automation | **Patchright** over CDP (`src/browser/pw.ts`) — was Playwright |
| Warmup kinds | `browse` (AU sites only) → `benign` (Google) → `graduation` |
| Queue | BullMQ `warmup-jobs` (concurrency 1) + Redis GoLogin slot lock (1 parallel) |
| Worker | Railway worker service |

Proxy is **not** stored on the identity. Each session allocates a new sticky lease (city-targeted username, ~30 min TTL).

---

## Railway worker env (expected)

```bash
BROWSER_PROFILE_PROVIDER=gologin
GOLOGIN_BROWSER_RUNTIME=orbita
GOLOGIN_HEADLESS=false
PROXY_PROVIDER=premiumports
EXPERIMENT_RUNNER_ENABLED=true

PREMIUMPORTS_PROXY_HOST=…
PREMIUMPORTS_PROXY_PORT=8888
PREMIUMPORTS_PROXY_USERNAME=…
PREMIUMPORTS_PROXY_PASSWORD=…

# Warmup pacing defaults
WARMUP_MIN_DAYS=4
WARMUP_BENIGN_SITE_CLICKS=2
WARMUP_SPREAD_DAYS=7
WARMUP_WINDOW_HOURS=168
WARMUP_SESSION_GAP_MINUTES=120
WARMUP_FIRST_DELAY_HOURS=36
WARMUP_BROWSE_SESSIONS=3
WARMUP_BROWSE_SPREAD_DAYS=2
WARMUP_BROWSE_FIRST_DELAY_HOURS=2
WARMUP_BENIGN_RETRY_HOURS=2
WARMUP_GRADUATION_RETRY_HOURS=3
```

Decodo vars may still exist for rollback; **do not use** unless intentionally A/B testing.

---

## Cookie-age (current next step)

After Patchright Step 1 failed (`au_080` → `unusual traffic`), new identities get **browse-only** sessions before any Google hit:

1. `browse` × `WARMUP_BROWSE_SESSIONS` (default 3) over ~`WARMUP_BROWSE_SPREAD_DAYS` (2), first after ~`WARMUP_BROWSE_FIRST_DELAY_HOURS` (2)
2. Then normal `benign` + `graduation` Google warmups

```bash
# Create + schedule cookie-age (no same-day Google)
npm run warmup:cookie-age -- --confirm --count 1

# After all browse rows complete → one Google probe
npm run warmup:probe-one -- --confirm --id=au_XXX
# Override browse gate only if intentional:
npm run warmup:probe-one -- --confirm --id=au_XXX --force
```

---

## Warmup session flow (current code)

1. Allocate Premium Ports lease (AU + city sticky)
2. Start headful Orbita with profile timezone (not Sydney-forced)
3. Apply CDP stealth patches (`src/browser/stealth.ts`)
4. Verify egress country = AU
5. **If `kind=browse`:** visit 2–4 AU sites with longer dwell — **never open Google** — complete
6. **If `kind=benign` / `graduation`:** short AU softener → `google.com.au` → query → SERP  
   Benign: click organic → site journey · Graduation: inspect only
7. On `google_sorry_page` / `unusual traffic` / block: **park identity**, cancel pending — **no retry**

Profile create UAs are Chrome/135 to match Orbita `browserMajorVersion: 135`.

---

## Important behaviours / fixes shipped

| Change | Why |
|--------|-----|
| UA Chrome/135 + real profile TZ into Orbita | Kill UA/TZ mismatch |
| Geo lookup on dedicated tab, fetch-first | Stop false `proxy_error` from navigation races |
| Park on block (no 2h Google retry) | Stop burning flagged fingerprints |
| Warmup backfill only for never-scheduled active IDs | Stop worker/dashboard from resurrecting cancelled schedules |
| Pre-Google AU browse | Soften “cold profile → Google only” |
| Stealth init scripts | Patch common `navigator.webdriver` / chrome / plugins tells |
| Ops scripts | `identities:retire-pool`, `identities:keep-cohort`, `warmup:pause`, `warmup:probe-one`, `warmup:reschedule-cohort` |

---

## Pool status (as of last audits)

Operational mode: **paused / probe-only**. Do not mass-reschedule the cohort until a probe succeeds.

| Identity | Role | Last known outcome |
|----------|------|--------------------|
| `au_001`–`au_054` | Retired / disabled / historical | Ignore for warmup |
| `au_055` | PP probe | `google_sorry_page` (AU/Sydney) — parked |
| `au_056`–`au_074` | Original “20” cohort | Mixed; several parked after sorry; schedules cancelled |
| `au_075` | Decodo A/B | `google_sorry_page` (AU/Melbourne) — parked |
| `au_076` | PP + stealth probe | `google_sorry_page` (AU/Melbourne) — parked |
| `au_078` | Patchright (pre-fix) | `browser_error` (`this.context is not a function`) — cancelled |
| `au_080` | Patchright Step-1 probe A | `unusual traffic` (AU/Melbourne) — parked |
| `au_077` / `au_079` | cancelled by pause before run | no session |

`warmup:pause` cancels scheduled/running warmups and drains BullMQ queues.  
Backfill will **not** recreate schedules for identities that already have any warmup rows.

---

## A/B results (proxy vendor + automation)

| Probe | Provider | Client | Geo OK? | Google |
|-------|----------|--------|---------|--------|
| `au_055` | premiumports | Playwright | Yes (Sydney) | `google_sorry_page` |
| `au_075` | decodo | Playwright | Yes (Melbourne) | `google_sorry_page` |
| `au_076` | premiumports + stealth + pre-Google | Playwright | Yes (Melbourne) | `google_sorry_page` |
| `au_080` | premiumports | **Patchright** | Yes (Melbourne) | `unusual traffic` |
| Patchright probe B | — | — | — | **not run** (gate failed on A) |

**Conclusion:** Not a Premium Ports–only IP problem. Playwright and Patchright both reach AU geo and still get Google interstitial/block on first Google visit.

**Step 1 gate: FAILED.** Fresh Patchright identity `au_080` hit `unusual traffic` (same fail class as `google_sorry_page`). Mass cohort remains paused. Next plan = cookie-age (browse-only, then Google), not Decodo / not more same-day Google probes.

---

## Useful commands

```bash
# Status
npm run warmup:status
npx tsx scripts/audit-active-warmups.ts
npx tsx scripts/audit-today-wave.ts
npx tsx scripts/audit-au055.ts --id=au_076

# Pause everything
npm run warmup:pause -- --confirm

# Keep only au_055–074 active (older helper)
npm run identities:keep-cohort -- --confirm

# Single probe (~20 min delay)
npm run identities:create-additional -- --count 1
npm run warmup:probe-one -- --confirm --id=au_XXX

# Recycle GoLogin seats
npm run identities:retire-pool -- --confirm
npm run gologin:delete-retired -- --confirm
```

---

## What is confirmed working

- Headful Orbita on Railway (`Orbita ready … (headful, proxy via worker)`)
- Premium Ports egress to real AU cities
- Single-slot concurrency
- Pause / park / no-resurrection backfill
- Probe tooling

## What is not working yet

- Fresh identities reaching Google Search without `google_sorry_page` / `unusual traffic` (Patchright Step 1 included)

---

## Recommended next steps

1. Stay on `PROXY_PROVIDER=premiumports`.
2. **Do not** mass-resume the cohort.
3. Deploy cookie-age (`browse` kind + migration), set browse env vars on Railway.
4. `npm run warmup:cookie-age -- --confirm --count 1` — wait for browses — then one `warmup:probe-one`.
5. If that Google probe still fails: ask Premium Ports for mobile/4G/ISP AU; deeper Orbita CDP work.

---

## Key files

- `src/sessions/warmup-runner.ts` — warmup browser session
- `src/warmup/warmup-service.ts` — schedule / eligibility / park-on-block / backfill
- `src/providers/browser/gologin-orbita.ts` — Orbita launch
- `src/providers/browser/GoLoginProvider.ts` — profile create + TZ
- `src/providers/proxy/PremiumPortsProvider.ts` — sticky AU proxy
- `src/browser/pw.ts` — Patchright facade (Chromium CDP client)
- `src/browser/stealth.ts` — CDP stealth patches
- `src/browser/pre-google-browse.ts` — AU sites before Google
- `src/browser/egress-geo.ts` — egress check
- `scripts/probe-one-warmup.ts` — single identity probe
- `scripts/pause-warmups.ts` — emergency pause
- `railway.env.example` — env template
- `Dockerfile` — Playwright base image + `npx patchright install chromium`
