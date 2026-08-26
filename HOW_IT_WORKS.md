# How the AU SERP Experiment Platform Works

This document describes the current end-to-end behaviour of the platform as implemented today.

---

## Purpose

The platform runs controlled browser sessions that simulate Australian Google Search users. Each session:

1. Opens a real browser (GoLogin cloud profile)
2. Routes traffic through an AU proxy (Decodo)
3. Searches Google for a configured query
4. Finds and clicks the target domain in the SERP
5. Engages with the landing page (scroll, dwell, optional internal click)
6. Logs everything to PostgreSQL for analysis against Search Console / GA4 data

The goal is to measure whether search-originated visits across a query cluster correlate with GSC visibility changes — not to bypass Google security.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Scheduler  │────▶│ BullMQ Worker│────▶│  Session Runner │
│  (monthly)  │     │   (Redis)    │     │   (Playwright)  │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    │                              │                              │
              ┌─────▼─────┐                 ┌──────▼──────┐               ┌───────▼───────┐
              │  GoLogin  │                 │   Decodo    │               │  PostgreSQL   │
              │  (cloud   │                 │  (AU proxy) │               │  (sessions,   │
              │  browser) │                 │             │               │   events)     │
              └───────────┘                 └─────────────┘               └───────────────┘
```

| Component | Role |
|-----------|------|
| **GoLogin** | Cloud browser profiles (desktop + mobile fingerprints) |
| **Decodo** | Sticky AU residential (desktop) or mobile proxies |
| **Playwright** | Connects to GoLogin via CDP; drives the browser |
| **PostgreSQL + Prisma** | Experiments, identities, sessions, events |
| **BullMQ + Redis** | Scheduled session queue |
| **Express API + Next.js dashboard** | Admin UI and reporting |

---

## Core Concepts

### Experiment

Defined in a YAML file under `experiments/` (e.g. `test-003.yml`). Contains:

- **Target URL / domain** — page to find and click
- **Query cluster** — weighted list of search terms (core, close variation, local, long tail)
- **Schedule** — allowed hours, timezone, identity reuse rules
- **Engagement weights** — probability of each on-site behaviour template
- **Search config** — max SERP pages to scan (default 3)

### Identity

A synthetic AU user persona stored in the DB:

- External ID: `au_001`, `au_008`, etc.
- GoLogin profile ID (cloud browser fingerprint)
- Device class: `desktop` or `mobile`
- Region/city/timezone (e.g. Brisbane, QLD)
- Usage stats: sessions, blocks, target clicks

Identities are created with `npm run identities:create` and mapped to GoLogin profiles. Mobile profiles can be repaired with `npm run gologin:repair`.

### Session

One browser run. Statuses include:

| Status | Meaning |
|--------|---------|
| `completed` | Full flow succeeded (search → click → engagement) |
| `target_not_found` | Google loaded but target domain not in SERP (within max pages) |
| `blocked` | Google CAPTCHA / unusual traffic — session stops immediately |
| `browser_error` | Infrastructure failure |

### Treatment Groups

Each scheduled session is assigned a group:

- **`search`** — Google search → find target → click → engage (primary treatment)
- **`direct`** — Navigate directly to target URL → engage (control)
- **`none`** — No-op (baseline control)

Manual tests via `session:test` always use `search`.

---

## Session Flow (Search Group)

This is what happens when you run:

```bash
npm run session:test -- --identity au_008 --experiment test-003 --query "womens breeches"
```

### 1. Setup

- Create a `Session` record in PostgreSQL
- Register SIGINT/SIGTERM cleanup handlers (stops GoLogin cloud profile on exit)
- Allocate a **Decodo proxy lease**:
  - Desktop identities → residential credentials
  - Mobile identities → mobile credentials
  - Username format: `user-{name}-country-au-city-{city}-session-{id}-sessionduration-30`
  - Sticky for the session duration (~30 min)

### 2. Start Browser

- **GoLogin**: stop any existing cloud session → update profile proxy → start cloud container → wait ~15s → connect Playwright over CDP (`wss://...`)
- Retry CDP connect up to 4 times

### 3. Google Search

Real runs (`DRY_RUN=false`):

1. Navigate to `https://www.google.com.au/?hl=en-AU&gl=au`
2. Accept cookie consent if present (`Accept all`, `I agree`, etc.)
3. Check for block signals (CAPTCHA, unusual traffic) — **stop if blocked**
4. Click the search box
5. Pause 700–2000 ms
6. Type the query character-by-character (45–130 ms delay per key)
7. Pause 500–1600 ms
8. Press Enter
9. Accept consent again if needed
10. Check for blocks again

Dry runs (`DRY_RUN=true`) load a mock SERP page instead — no real Google.

### 4. SERP Parsing

Scan up to `max_serp_pages` (default 3) for the target domain.

**How results are found:**

- Collect organic link candidates from Google DOM (`#search .g`, `div.MjjYud`, etc.)
- For each link, capture: `href`, title text, and **cite text** (displayed URL)
- Match target domain by:
  1. Decoded href — desktop often uses `/url?q=https://...`
  2. **Cite text** — mobile often uses opaque `/goto?url=CAES...` wrappers; the visible cite shows `theequestrian.com.au › ...`

**Position** is the organic rank on that page (1-indexed).

If not found on page 1, click Next and repeat.

### 5. Click Target

- Click the matched `<a>` element by href (same link a human would tap)
- Google redirects through `/goto?url=...` or `/url?q=...` to the real site
- Wait for landing page load
- Record `landingUrl`, `observedPosition`, `serpPage`

### 6. On-Site Engagement

A template is picked randomly from experiment weights:

| Template | Behaviour |
|----------|-----------|
| `read_only` | Scroll 35–75% depth, dwell 35–100s |
| `internal_navigation` | Scroll, click one internal link, scroll again, dwell |
| `short_visit` | Shallow scroll (10–35%), dwell 12–35s |
| `long_read` | Deep scroll (65–100%), dwell 90–240s |

Engagement uses:

- Random initial render wait (1.2–4.5s)
- Mouse wheel scroll in 120–420px steps with pauses between
- Internal link scoring (prefers main content, avoids login/cart)
- Random dwell time to fill out the session

Current `internal_navigation` does **one** internal click (2 pageviews max).

### 7. Teardown

- Write final session metrics (duration, scroll depth, bytes transferred, etc.)
- Close Playwright CDP connection
- Stop GoLogin cloud profile (DELETE API)
- Release proxy lease

---

## Proxy Routing

| Device | Decodo plan | Env vars |
|--------|-------------|----------|
| Desktop | Residential | `DECODO_RESIDENTIAL_PROXY_*` |
| Mobile | Mobile | `DECODO_MOBILE_PROXY_*` |

Both use `gate.decodo.com:7000` with city-scoped AU sessions.

---

## Block Detection

The platform does **not** attempt to solve CAPTCHAs or bypass blocks. Sessions stop immediately when:

- URL contains `sorry/index`
- Body matches: unusual traffic, captcha, verify you are human, automated queries
- reCAPTCHA iframe or form detected

Google consent pages (`before you continue`) are **not** treated as blocks — consent is accepted first.

---

## Scheduling (Production)

1. Create experiment: `npm run experiment:create -- experiments/test-003.yml`
2. Create identities: `npm run identities:create -- --count 100`
3. Generate monthly schedule: `npm run schedule:generate -- --experiment test-003`
4. Run worker: `npm run worker`

The scheduler:

- Distributes `sessions_per_month` across days
- Picks random times within allowed window (e.g. 06:30–23:00 Adelaide)
- Respects identity cooldowns (max 1/day, min 2-day gap)
- Enforces global minimum gap between any two sessions (5 min)
- Assigns weighted random query + treatment group
- Enqueues jobs to BullMQ; worker calls `runSession()`

Retries are applied for transient failures per retry policy.

---

## Environment Variables

```bash
# Core
DATABASE_URL=postgresql://...
BROWSER_PROFILE_PROVIDER=gologin   # mock | gologin | multilogin
PROXY_PROVIDER=decodo              # mock | decodo
DRY_RUN=false
EXPERIMENT_RUNNER_ENABLED=true

# GoLogin
GOLOGIN_API_TOKEN=

# Decodo — desktop (residential)
DECODO_RESIDENTIAL_PROXY_HOST=gate.decodo.com
DECODO_RESIDENTIAL_PROXY_PORT=7000
DECODO_RESIDENTIAL_PROXY_USERNAME=
DECODO_RESIDENTIAL_PROXY_PASSWORD=

# Decodo — mobile
DECODO_MOBILE_PROXY_HOST=gate.decodo.com
DECODO_MOBILE_PROXY_PORT=7000
DECODO_MOBILE_PROXY_USERNAME=
DECODO_MOBILE_PROXY_PASSWORD=

# Queue
REDIS_URL=redis://localhost:6379

# Analytics (optional)
GSC_CLIENT_ID= / GSC_CLIENT_SECRET= / GSC_REFRESH_TOKEN=
GA4_PROPERTY_ID=
```

---

## Key Commands

```bash
# One-off manual test (real Google)
npm run session:test -- --identity au_008 --experiment test-003 --query "womens breeches"

# Dry-run smoke test (mock SERP, fast engagement)
DRY_RUN=true npm run session:test -- --identity au_001 --query "sell eggs from home"

# Fix invalid GoLogin profile IDs on mobile identities
npm run gologin:repair -- --mobile-only

# Force-stop a stuck GoLogin cloud profile
npm run gologin:stop -- --identity au_001

# Recover sessions stuck in "running" state
npm run sessions:cleanup-stale

# Production worker
npm run worker
```

---

## What Gets Logged

Each session records:

- Proxy metadata (provider, region, city, IP hash)
- Google/search flags (`googleLoaded`, `searchSubmitted`, `targetFound`)
- SERP position and page
- Click and landing URLs
- Engagement: pageviews, internal clicks, scroll depth, duration
- Bytes transferred (from response Content-Length headers)
- Full event timeline in `session_events`

Example successful session (test-003, au_008):

```
browser_started → google_loaded → search_submitted → serp_loaded
→ target_found (position 8, page 1) → target_clicked → landing_loaded
→ scroll → internal_click → scroll → session_completed
```

Status: `completed` | Duration: ~9.5 min | Pageviews: 2

---

## Human-Likeness (Current State)

**What mimics a real user:**

- Real GoLogin browser fingerprint + AU proxy IP
- Opens google.com.au homepage
- Types query with random key delays
- Clicks the actual Google result link (including `/goto?url=` wrappers)
- Scrolls with wheel events and random pauses
- Dwells on page for minutes
- May click one internal link

**What is still mechanical:**

- No SERP scanning scroll before clicking
- No mouse movement on Google
- Internal navigation limited to 1 extra page
- Desktop sessions more likely to hit "unusual traffic" blocks

**Mobile vs desktop:** Mobile (`au_008`–`au_010`) has proven more reliable for real Google sessions. Desktop residential proxies often trigger blocks.

---

## File Map

| Path | Purpose |
|------|---------|
| `src/sessions/session-runner.ts` | Orchestrates full session lifecycle |
| `src/browser/google-search.ts` | Google load, type query, submit |
| `src/browser/serp-parser.ts` | Find target in SERP, click result |
| `src/browser/engagement.ts` | On-site scroll, dwell, internal nav |
| `src/browser/blocked-detection.ts` | CAPTCHA/block detection + consent |
| `src/providers/browser/GoLoginProvider.ts` | GoLogin cloud start/stop/CDP |
| `src/providers/proxy/DecodoProvider.ts` | Proxy allocation by device class |
| `src/scheduler/worker.ts` | BullMQ job processor |
| `src/scheduler/schedule-generator.ts` | Monthly session scheduling |
| `experiments/*.yml` | Experiment definitions |

---

## Safety

- No stealth plugins or CAPTCHA bypass
- Blocked sessions are logged and counted, not retried indefinitely
- GoLogin profiles are always stopped on success, failure, or SIGINT
- Stale "running" sessions are recoverable via cleanup script
