# CTR Browser Setup — Current State

Last updated: 2026-09-28

## Summary

Production runs on **Camoufox** (Firefox-based anti-detect browser). GoLogin/Orbita + Patchright
was retired after control tests showed the browser stack itself was what Google detected:

| Test | Result |
|------|--------|
| Orbita, home IP, no proxy | Blocked |
| Camoufox, home IP, cold (no warming) | 6/6 clean |
| Camoufox, Premium Ports, cold | 2/3 clean (one flagged 179.x IP) |
| Camoufox on Railway worker, Premium Ports Adelaide, cold `au_085` | 3/3 Google clean; real mouse click → site visit |

GoLogin seats are no longer needed (legacy GoLogin identities are skipped under Camoufox).

---

## Runtime stack

| Layer | Setting |
|-------|---------|
| Browser | Camoufox via `camoufox-js` 0.12 (`BROWSER_PROFILE_PROVIDER=camoufox`) |
| Automation | `playwright-core` 1.60.0 (pinned — must match camoufox-js) via `src/browser/pw.ts` |
| Fingerprint | Pinned per identity in `browser_fingerprints` (device, WebGL, canvas/audio/font seeds) |
| Profile (cookies) | Persistent dir on Railway volume `worker-volume` → `CAMOUFOX_PROFILE_DIR=/data/camoufox` |
| Display | Headful via Xvfb (`GOLOGIN_HEADLESS=false`, reused flag) |
| Proxy | Desktop: Premium Ports sticky AU residential. Mobile: `MOBILE_PROXY_PROVIDER` (SOAX carrier IPs, country-wide). New lease per session |
| Devices | Desktop + mobile. Mobile = Camoufox (linux) spoofed as Firefox for Android: UA (JS + header), phone screen, touch; pinned per identity (`browser_fingerprints.os = android`). Without `MOBILE_PROXY_PROVIDER`, new identities are desktop only |
| Queue | BullMQ `session-jobs` + `warmup-jobs`, concurrency 1 |

## Railway env

Worker: `BROWSER_PROFILE_PROVIDER=camoufox`, `CAMOUFOX_PROFILE_DIR=/data/camoufox`,
`GOLOGIN_HEADLESS=false`, `PROXY_PROVIDER=premiumports`, `PREMIUMPORTS_*`,
`MOBILE_PROXY_PROVIDER=soax`, `SOAX_PACKAGE_KEY`, `SOAX_NETWORK=mob`,
`WARMUP_MIN_DAYS=2`, `WARMUP_BENIGN_SITE_CLICKS=1`, `WARMUP_SPREAD_DAYS=2`,
`WARMUP_WINDOW_HOURS=48`, `WARMUP_FIRST_DELAY_HOURS=12`.

API (`ctr`): `BROWSER_PROFILE_PROVIDER=camoufox` (so dashboard-created identities are Camoufox).
The API service deploys via `railway up --service ctr`; the worker deploys from git pushes to `main`.

---

## Session flow

1. Allocate Premium Ports lease and test it before any browser starts (`lease-check.ts`): ip-api.com
   and ipinfo.io must both say AU, at least one must place it in the identity's metro, both must see
   the same IP (sticky actually holds), and its /24 must not be in `blocked_ip_prefixes` (Google
   blocks, 14 days) or `bad_geo_ip_prefixes` (wrong country/city or rotating, 30 days; `*` scope =
   every city). Rejected leases record their /24 and a fresh lease is drawn, up to 8. If all 8 fail
   the work is deferred 30 min (`proxy_pool_exhausted`, session status `cancelled`) instead of
   counting as a failure. Preflight checks use the same gate (`allocateCleanLease`).
   Mobile leases: country only (no metro check), Google blocks keyed by exact IP (carrier /24s are
   CGNAT shared by many phones), and rejected mobile IPs are not written to `bad_geo_ip_prefixes`.
2. Launch Camoufox with the identity's pinned fingerprint and profile dir; timezone/locale/WebRTC
   from the egress IP; optional campaign GPS point (see below)
3. In-browser egress gate repeats the country/city and /24 checks as a second line
4. Google search → pick result → **real mouse click** at a verified, uncovered point on the title
   (native link click fallback); a click that doesn't navigate is an error, not a success
5. Site journey

## Block policy (retry once)

On a Google block: flag the egress /24, increment `identities.consecutive_blocks`.
First block → retry in 30 min on a fresh IP. Second consecutive block → park identity.
Any clean Google load resets the streak. Applies to campaign and warmup sessions.

## Campaign settings (review step → "Identities & GPS targeting")

- **Identity pool:** "Warmed only" or "Any, including unwarmed" (`requireWarmupIdentities`)
- **GPS centre + radius:** paste `lat, lng` from Google Maps. Each identity gets a stable point
  within the radius (default 3 km), granted to google.com.au. Leave blank to skip GPS.

## Ranking snapshots (campaign → Snapshots tab)

One screenshot per active query, stored as JPEG in `rank_snapshots` with the position found:

- **Baseline:** queued for any active query without one as soon as the campaign is active
- **End of day:** `scheduleEnd` + 30 min in the campaign timezone (23:30 by default)
- **Manual:** "Take snapshot now" button (works on any campaign status, runner on or off)

Worker runs all of a campaign's due rows in one Camoufox session (`rank-snapshot-jobs` queue, shares
the browser lock), GPS pinned to the campaign centre, using the least-recently-used local identity
not in the campaign. Blocks follow the retry-once policy. GMB → local pack / Places list;
URL → the SERP page the site is on (page 1 if not found).

## Warm pool (Identities page)

Per-city target of Camoufox identities (warming + warm). Worker tops up hourly (max 3 new per
tick) and gives warm identities idle ≥ 7 days a browse session. Light warmup: 2 browse sessions,
1 benign click, graduation, eligible after ~2 days.

---

## Useful commands

```bash
# End-to-end smoke test (creates real identities + one benign warmup due now)
BROWSER_PROFILE_PROVIDER=camoufox npx tsx scripts/camoufox-smoke.ts --confirm --city=Adelaide

# Local visible Camoufox control run (your IP, or --proxy for Premium Ports)
npx tsx scripts/camoufox-home-control.ts --confirm [--proxy] [--click] [--query="..."]

# Inspect a session + events
npx tsx scripts/inspect-session.ts --id=<sessionId>
```

## Open items

- Live campaign test: "plumber Mount Barker" (GMB + URL) for McLennan Plumbing & Gas, unwarmed pool
- Retire GoLogin (subscription, legacy identities, `patch-gologin` postinstall) after the live test
- `railway ssh` needs an SSH key registered on the Railway account (`railway ssh keys add`)

## Key files

- `src/providers/browser/CamoufoxProvider.ts` — launch, profile dir, GPS grant
- `src/providers/browser/camoufox-fingerprint.ts` / `camoufox-geo.ts` — pinned fingerprint, geo config
- `src/providers/proxy/ip-reputation.ts` — /24 screen for Google-blocked ranges
- `src/providers/proxy/lease-check.ts` / `bad-geo-prefixes.ts` / `proxy-http.ts` — pre-launch lease
  test and wrong-geo /24 memory; `src/sessions/clean-lease.ts` — draw-until-clean and exhaustion
- `src/identities/block-policy.ts` / `provider-compat.ts` — retry-once, Camoufox-only identities
- `src/browser/serp-parser.ts` / `serp-trusted-click.ts` — result collection, trusted clicks
- `src/warmup/warm-pool.ts` / `warm-pool-settings.ts` — warm-pool targets and top-up
- `dashboard/app/components/campaign/CampaignTargetingFields.tsx`, `WarmPoolPanel.tsx`
- `src/rank-snapshots/*` — snapshot triggers, queue, runner, capture;
  `dashboard/app/components/campaign/CampaignSnapshotsTab.tsx`
