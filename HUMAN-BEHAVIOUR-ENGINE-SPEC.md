# Human Behaviour Engine — Implementation Spec

This document defines the behaviour engine to add on top of the existing AU SERP Experiment Platform. It replaces per-event randomness and predetermined search outcomes with **persistent personas**, **session-level traits**, and **probabilistic action trees**.

**Prerequisite reading:** [HOW_IT_WORKS.md](./HOW_IT_WORKS.md)

---

## Goals

1. Each identity behaves like a consistent person across sessions, not a fresh random draw every run.
2. Search is a **journey** (inspect SERP, maybe reformulate, maybe abandon) — not query → Enter → click.
3. Query reformulations come only from the experiment's approved query cluster.
4. Not every session reaches the target page — abandonment and no-click outcomes are valid and logged.
5. Correlated behaviour: slow typists read longer; curious users click more internal links; mobile skimmers scroll more but dwell less.

**Non-goals:** fingerprint engineering, CAPTCHA bypass, LLM-generated queries, stealth plugins.

---

## Current vs Target

### Current flow (search group)

```
runSession()
  → selectEngagementTemplate()        # independent random pick
  → runSearchFlow()
       → goto google.com.au
       → type query (fixed delay ranges)
       → findTargetInSerp()           # immediate parse
       → clickSerpResult()             # always click if found
  → runEngagement()                   # 1 template, max 1 internal click
  → status: completed | target_not_found | blocked
```

### Target flow

```
runSession()
  → loadOrAssignPersona(identity)
  → generateSessionTraits(persona)    # once per session
  → runSearchJourney()                # probabilistic tree
       → submitQuery()
       → inspectSerp()                 # scan, scroll, pause
       → decide: reformulate | abandon | click | skip-click
       → (repeat up to maxSearches)
  → runSiteJourney()                  # probabilistic tree
       → read / internal nav / back-to-SERP / multi-page
  → status: completed | search_abandoned | target_found_no_click
            | target_not_found | query_reformulated | blocked
```

---

## Architecture

```
Identity
  └── Persona (persistent, assigned once)
       ├── search behaviour
       ├── typing behaviour
       ├── SERP inspection behaviour
       ├── navigation behaviour
       ├── reading behaviour
       └── session-ending behaviour

Session
  └── SessionTraits (generated once at start, derived from persona + noise)
       ├── pace
       ├── attentionLevel
       ├── curiosity
       ├── searchConfidence
       └── navigationDepth
```

### New source files

| File | Responsibility |
|------|----------------|
| `src/behaviour/personas.ts` | Persona definitions, YAML loader, assignment |
| `src/behaviour/session-traits.ts` | Generate correlated traits from persona |
| `src/behaviour/search-journey.ts` | Search state machine orchestrator |
| `src/behaviour/serp-inspection.ts` | SERP scan, scroll, pause (before click decision) |
| `src/behaviour/query-evolution.ts` | Pick next query from cluster given current query + persona |
| `src/behaviour/site-journey.ts` | Post-click state machine (replaces `runEngagement` orchestration) |
| `src/behaviour/action-tree.ts` | Generic weighted branch picker |
| `config/personas.yml` | Default persona library |

### Existing files to keep as primitives

| File | Role after refactor |
|------|---------------------|
| `src/browser/google-search.ts` | `openGoogle()`, `typeAndSubmitQuery()` — no find/click orchestration |
| `src/browser/serp-parser.ts` | `findTargetInSerp()`, `clickSerpResult()` — unchanged |
| `src/browser/engagement.ts` | `scrollToDepth()`, dwell helpers — called by site-journey |
| `src/browser/internal-links.ts` | `pickInternalLink()` — called by site-journey |
| `src/browser/blocked-detection.ts` | Unchanged |

### Files to refactor

| File | Change |
|------|--------|
| `src/sessions/session-runner.ts` | Call behaviour engine instead of linear search + engagement |
| `src/identities/identity-service.ts` | Assign persona on create; expose `getPersonaForIdentity()` |
| `src/config/experiments.ts` | Optional `behaviour:` block in experiment YAML |
| `prisma/schema.prisma` | Persona fields on Identity; new statuses/events on Session |

---

## Persona Schema

Personas live in `config/personas.yml` and can be overridden per experiment.

```yaml
personas:

  quick_scanner:
    weight: 0.20
    device_filter: any          # any | desktop | mobile
    typing_speed: fast          # fast | medium | normal | slow
    typing_delay_ms: [35, 75]
    pre_type_pause_ms: [400, 1200]
    post_type_pause_ms: [300, 900]
    serp_scan_seconds: [2, 8]
    serp_scroll_probability: 0.25
    serp_scroll_depth: [0.15, 0.45]
    reformulate_probability: 0.08
    max_searches_per_session: 2
    target_click_probability_if_found: 0.80
    page_depth: shallow         # shallow | medium | deep
    internal_click_probability: 0.12
    back_to_serp_probability: 0.10
    max_internal_pages: 1
    dwell_seconds: [15, 50]

  normal_researcher:
    weight: 0.40
    device_filter: any
    typing_speed: normal
    typing_delay_ms: [45, 130]
    pre_type_pause_ms: [700, 2000]
    post_type_pause_ms: [500, 1600]
    serp_scan_seconds: [5, 18]
    serp_scroll_probability: 0.60
    serp_scroll_depth: [0.25, 0.70]
    reformulate_probability: 0.18
    max_searches_per_session: 3
    target_click_probability_if_found: 0.85
    page_depth: medium
    internal_click_probability: 0.35
    back_to_serp_probability: 0.12
    max_internal_pages: 2
    dwell_seconds: [40, 130]

  deep_researcher:
    weight: 0.15
    device_filter: any
    typing_speed: normal
    typing_delay_ms: [55, 150]
    pre_type_pause_ms: [900, 2500]
    post_type_pause_ms: [700, 2000]
    serp_scan_seconds: [10, 30]
    serp_scroll_probability: 0.85
    serp_scroll_depth: [0.40, 0.90]
    reformulate_probability: 0.30
    max_searches_per_session: 4
    target_click_probability_if_found: 0.75
    page_depth: deep
    internal_click_probability: 0.55
    back_to_serp_probability: 0.20
    max_internal_pages: 3
    dwell_seconds: [90, 260]

  mobile_skimmer:
    weight: 0.25
    device_filter: mobile
    typing_speed: medium
    typing_delay_ms: [40, 100]
    pre_type_pause_ms: [500, 1500]
    post_type_pause_ms: [400, 1200]
    serp_scan_seconds: [3, 12]
    serp_scroll_probability: 0.70
    serp_scroll_depth: [0.30, 0.75]
    reformulate_probability: 0.12
    max_searches_per_session: 2
    target_click_probability_if_found: 0.82
    page_depth: medium
    internal_click_probability: 0.22
    back_to_serp_probability: 0.08
    max_internal_pages: 2
    dwell_seconds: [25, 90]
```

### Persona assignment rules

1. Assign once when identity is created (or on first session if migrating existing identities).
2. Use weighted random from eligible personas (`device_filter` must match `identity.deviceClass`).
3. Persist `personaId` on `Identity` — never re-roll unless explicitly repaired.
4. Optional stable noise: `personaSeed = hash(identity.externalId)` used to jitter trait generation so the same identity is consistently "on the fast/slow side" of their persona range.

---

## Session Traits

Generated **once** at session start. All downstream decisions multiply persona base values by these traits.

```typescript
interface SessionTraits {
  pace: number;              // 0.6–1.4  — affects typing delay, pause lengths
  attentionLevel: number;    // 0.5–1.5  — scroll depth, dwell, SERP scan time
  curiosity: number;         // 0.3–1.7  — internal clicks, multi-page depth
  searchConfidence: number;  // 0.4–1.6  — inverse of reformulate probability
  navigationDepth: number;   // 0.2–1.8  — max internal pages tendency
}
```

### Generation formula

```typescript
function generateSessionTraits(persona: Persona, seed: number): SessionTraits {
  const r = seededRandom(seed); // e.g. hash(sessionId + identityId)

  return {
    pace: clamp(0.6, 1.4, r.gaussian(1.0, 0.15)),
    attentionLevel: clamp(0.5, 1.5, r.gaussian(1.0, 0.20)),
    curiosity: clamp(0.3, 1.7, r.gaussian(1.0, 0.25)),
    searchConfidence: clamp(0.4, 1.6, r.gaussian(1.0, 0.20)),
    navigationDepth: clamp(0.2, 1.8, r.gaussian(1.0, 0.25)),
  };
}
```

### Derived effective values (examples)

```typescript
effectiveTypingDelayMs = persona.typing_delay_ms.map(v => v / traits.pace)
effectiveSerpScanSec   = persona.serp_scan_seconds.map(v => v * traits.attentionLevel)
effectiveDwellSec      = persona.dwell_seconds.map(v => v * traits.attentionLevel)
effectiveReformulateP  = persona.reformulate_probability / traits.searchConfidence
effectiveInternalClickP = persona.internal_click_probability * traits.curiosity
effectiveMaxInternalPages = Math.round(persona.max_internal_pages * traits.navigationDepth)
```

A slow typist (`pace < 1`) naturally gets longer pauses **and** (via same trait correlation hook) longer reading if `attentionLevel` is co-sampled with positive correlation to `1/pace`.

**Optional correlation matrix** (v2): sample traits from a multivariate normal with persona-specific covariance so `pace` and `attentionLevel` are positively correlated for `deep_researcher` and weakly correlated for `quick_scanner`.

---

## Search Journey State Machine

### Top-level outcome tree (per search attempt)

After SERP loads and target lookup runs:

```
SERP loaded
 │
 ├─ 12% (× persona.reformulate_probability × 1/searchConfidence)
 │     → reformulate query → new search attempt (if under max_searches)
 │
 ├─ 8% (× abandon factor)
 │     → search_abandoned — exit session, no click
 │
 └─ 80% (remainder)
       → inspectSerp()
            │
            ├─ scan visible results (serp_scan_seconds × attentionLevel)
            ├─ maybe scroll (serp_scroll_probability)
            └─ if target found
                   │
                   ├─ target_click_probability_if_found → click
                   └─ 1 − probability → target_found_no_click → exit or reformulate
```

If target **not** found after inspection:
- If searches remaining and `reformulate_probability` triggers → reformulate
- Else → `target_not_found`

### SERP inspection (`serp-inspection.ts`)

```typescript
async function inspectSerp(
  page: Page,
  persona: Persona,
  traits: SessionTraits,
  onEvent: EventCallback,
): Promise<SerpInspectionResult> {
  // 1. Initial scan pause (no scroll)
  await sleep(randomInRange(persona.serp_scan_seconds) * traits.attentionLevel * 1000);

  // 2. Optional scroll down/up
  if (Math.random() < persona.serp_scroll_probability) {
    const depth = randomInRange(persona.serp_scroll_depth) * traits.attentionLevel;
    await scrollSerp(page, depth);          // wheel on SERP, not landing page
    onEvent('serp_scrolled', { depth });
    await sleep(randomBetween(800, 2500) / traits.pace);
    // 30% chance scroll back up partially (re-reading behaviour)
    if (Math.random() < 0.30) {
      await scrollSerp(page, -depth * randomBetween(0.2, 0.6));
    }
  }

  return { inspected: true };
}
```

No mouse movement in v1 (optional v2: random `page.mouse.move` within viewport bounds).

### Query evolution (`query-evolution.ts`)

Reformulation picks the **next query** from the experiment cluster — never generates free text.

**Allowed transition graph** (by `QueryType`):

| From | Can refine to |
|------|---------------|
| `core` | `close_variation`, `local`, `long_tail` |
| `close_variation` | `local`, `long_tail`, `core` |
| `local` | `long_tail`, `close_variation` |
| `long_tail` | `local`, `close_variation` |
| `semantic` | `core`, `close_variation` |

**Selection algorithm:**

```typescript
function pickReformulatedQuery(
  current: ExperimentQuery,
  cluster: ExperimentQuery[],
  persona: Persona,
  traits: SessionTraits,
  usedQueries: Set<string>,
): ExperimentQuery | null {
  const allowedTypes = REFINEMENT_GRAPH[current.queryType];
  const candidates = cluster.filter(
    q => q.active
      && q.id !== current.id
      && !usedQueries.has(q.query)
      && allowedTypes.includes(q.queryType),
  );
  if (candidates.length === 0) return null;

  // Weight by experiment weight × type preference
  // deep_researcher prefers local/long_tail; quick_scanner prefers close_variation
  return selectWeightedQuery(candidates);
}
```

**Example path (test-003):**

1. `womens breeches` (core)
2. → `womens breeches australia` (local)
3. → click theequestrian.com.au

Or:

1. `buy womens breeches online australia` (long_tail) — immediate specific search
2. → click

### Search journey orchestrator

```typescript
interface SearchJourneyResult {
  status: 'completed' | 'search_abandoned' | 'target_found_no_click' | 'target_not_found';
  searches: SearchAttempt[];
  targetFound: boolean;
  targetClicked: boolean;
  serpPage?: number;
  observedPosition?: number;
  resultTitle?: string;
  resultUrl?: string;
  landingUrl?: string;
}

interface SearchAttempt {
  queryText: string;
  queryType: QueryType;
  targetFound: boolean;
  clicked: boolean;
  abandoned: boolean;
  serpPage?: number;
  position?: number;
}
```

```typescript
async function runSearchJourney(input: SearchJourneyInput): Promise<SearchJourneyResult> {
  const { page, persona, traits, cluster, targetDomain, maxSerpPages, initialQuery } = input;
  const usedQueries = new Set<string>();
  let currentQuery = initialQuery;
  const attempts: SearchAttempt[] = [];

  for (let i = 0; i < persona.max_searches_per_session; i++) {
    usedQueries.add(currentQuery.query);

    await typeAndSubmitQuery(page, currentQuery.query, persona, traits);
    await appendEvent('search_submitted', { query: currentQuery.query, attempt: i + 1 });

    if (await detectBlocked(page)) return { status: 'blocked', ... };

    // Pre-inspection abandon (before even parsing)
    if (shouldAbandonBeforeInspect(persona, traits)) {
      return { status: 'search_abandoned', searches: attempts, ... };
    }

    await inspectSerp(page, persona, traits, appendEvent);

    const serp = await findTargetInSerp(page, targetDomain, maxSerpPages);

    if (serp.result) {
      await appendEvent('target_found', { position: serp.result.position, attempt: i + 1 });

      if (!shouldClickTarget(persona, traits)) {
        await appendEvent('target_skipped', { position: serp.result.position });
        // Maybe reformulate instead of exiting
        const next = maybeReformulate(...);
        if (next) { currentQuery = next; continue; }
        return { status: 'target_found_no_click', ... };
      }

      await clickSerpResult(page, serp.result);
      await appendEvent('target_clicked', { ... });
      return { status: 'completed', targetClicked: true, ... };
    }

    // Target not found on this attempt
    const next = maybeReformulate(currentQuery, cluster, persona, traits, usedQueries);
    if (next) {
      await appendEvent('query_reformulated', { from: currentQuery.query, to: next.query });
      currentQuery = next;
      continue;
    }

    return { status: 'target_not_found', searches: attempts, ... };
  }

  return { status: 'target_not_found', searches: attempts, ... };
}
```

---

## Site Journey State Machine

After target click (or direct flow), replace single `runEngagement()` call:

```
Landing page loaded
 │
 ├─ 15% → short_read → exit
 ├─ 35% → normal_read → exit
 ├─ 30% → read → internal_page (1)
 ├─ 10% → read → back_to_serp → (optional second click or exit)
 └─ 10% → read → internal_page (1) → internal_page (2+)
```

Branch weights are modulated by persona + traits:

```typescript
const weights = {
  short_read: 0.15 * (2 - traits.attentionLevel),
  normal_read: 0.35,
  internal_one: 0.30 * traits.curiosity,
  back_to_serp: persona.back_to_serp_probability * (2 - traits.searchConfidence),
  internal_multi: 0.10 * traits.curiosity * traits.navigationDepth,
};
// Normalize to sum to 1
```

### Site journey result

```typescript
interface SiteJourneyResult {
  pageviews: number;
  internalClicks: number;
  scrollDepth: number;
  durationSeconds: number;
  finalUrl: string;
  backToSerp: boolean;
  path: SiteJourneyStep[];
}

interface SiteJourneyStep {
  action: 'scroll' | 'dwell' | 'internal_click' | 'back_to_serp' | 'exit';
  url?: string;
  depth?: number;
}
```

### Back-to-SERP behaviour

```typescript
async function backToSerp(page: Page, persona: Persona, traits: SessionTraits): Promise<void> {
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await sleep(randomBetween(2000, 6000) / traits.pace);
  await inspectSerp(page, persona, traits, noop); // brief re-scan

  // 40% exit from SERP; 60% click a different result (not necessarily target)
  if (Math.random() < 0.40) return;

  // Optionally click target if still visible and passes shouldClickTarget
}
```

### Page depth mapping

| `page_depth` | Scroll target (% of page) | Typical dwell multiplier |
|--------------|---------------------------|--------------------------|
| `shallow` | 10–35% | 0.6× |
| `medium` | 35–75% | 1.0× |
| `deep` | 65–100% | 1.4× |

---

## TypeScript Interfaces

```typescript
// src/behaviour/types.ts

export type TypingSpeed = 'fast' | 'medium' | 'normal' | 'slow';
export type PageDepth = 'shallow' | 'medium' | 'deep';
export type DeviceFilter = 'any' | 'desktop' | 'mobile';

export interface Persona {
  id: string;
  weight: number;
  deviceFilter: DeviceFilter;
  typingSpeed: TypingSpeed;
  typingDelayMs: [number, number];
  preTypePauseMs: [number, number];
  postTypePauseMs: [number, number];
  serpScanSeconds: [number, number];
  serpScrollProbability: number;
  serpScrollDepth: [number, number];
  reformulateProbability: number;
  maxSearchesPerSession: number;
  targetClickProbabilityIfFound: number;
  pageDepth: PageDepth;
  internalClickProbability: number;
  backToSerpProbability: number;
  maxInternalPages: number;
  dwellSeconds: [number, number];
}

export interface SessionTraits {
  pace: number;
  attentionLevel: number;
  curiosity: number;
  searchConfidence: number;
  navigationDepth: number;
}

export interface BehaviourContext {
  persona: Persona;
  traits: SessionTraits;
  sessionId: string;
  identityId: string;
  deviceClass: DeviceClass;
}

export type SearchJourneyStatus =
  | 'completed'
  | 'search_abandoned'
  | 'target_found_no_click'
  | 'target_not_found'
  | 'blocked';

export type SiteJourneyBranch =
  | 'short_read'
  | 'normal_read'
  | 'internal_one'
  | 'back_to_serp'
  | 'internal_multi';
```

---

## Database Schema Changes

### `Identity` model — add fields

```prisma
model Identity {
  // ... existing fields ...
  personaId        String?   @map("persona_id")
  personaAssignedAt DateTime? @map("persona_assigned_at")
}
```

### `Session` model — add fields

```prisma
model Session {
  // ... existing fields ...
  personaId           String?  @map("persona_id")
  sessionTraitsJson   String?  @map("session_traits_json")
  searchAttempts      Int      @default(1) @map("search_attempts")
  queriesUsedJson     String?  @map("queries_used_json")  // string[]
  targetSkipped       Boolean  @default(false) @map("target_skipped")
  backToSerp          Boolean  @default(false) @map("back_to_serp")
}
```

### `SessionStatus` enum — add values

```prisma
enum SessionStatus {
  // ... existing ...
  search_abandoned
  target_found_no_click
}
```

### `SessionEventType` enum — add values

```prisma
enum SessionEventType {
  // ... existing ...
  serp_scrolled
  serp_inspected
  query_reformulated
  target_skipped
  back_to_serp
  search_abandoned
}
```

### Migration

```bash
npm run db:migrate
# name: add-behaviour-engine-fields
```

Backfill existing identities with weighted persona assignment in a one-off script `scripts/assign-personas.ts`.

---

## Experiment YAML Extension

Optional per-experiment behaviour overrides:

```yaml
behaviour:
  persona_weights:           # override global persona weights
    quick_scanner: 0.15
    normal_researcher: 0.45
    deep_researcher: 0.10
    mobile_skimmer: 0.30
  min_target_click_rate: 0.55   # floor for scheduling analytics (not enforced at runtime)
  allow_query_reformulation: true
  allow_search_abandon: true
  allow_target_skip: true
```

Add to `src/config/experiments.ts` schema as optional `behaviour` block. Global defaults in `config/personas.yml`.

---

## Session Runner Integration

Replace the search + engagement block in `session-runner.ts`:

```typescript
// Before (simplified)
const search = await runSearchFlow({ page, query, targetDomain, maxSerpPages });
// ...
const engagement = await runEngagement(page, engagementTemplate, engagementConfig, ...);

// After
const persona = await getPersonaForIdentity(input.identity, input.experiment);
const traits = generateSessionTraits(persona, session.id, input.identity.externalId);
const queries = await getExperimentQueries(input.experiment.id);
const initialQuery = resolveInitialQuery(input.queryText, queries);

const search = await runSearchJourney({
  page,
  persona,
  traits,
  cluster: queries,
  targetDomain: input.experiment.targetDomain,
  maxSerpPages: input.experiment.maxSerpPages,
  initialQuery,
  onEvent: (type, meta) => appendSessionEvent(session.id, type, meta),
});

if (search.status === 'blocked') { /* existing blocked handling */ }
if (search.status === 'search_abandoned') { /* new */ }
if (search.status === 'target_found_no_click') { /* new */ }
if (search.status === 'target_not_found') { /* existing */ }

if (search.targetClicked) {
  const site = await runSiteJourney({
    page,
    persona,
    traits,
    onEvent: (type, meta) => appendSessionEvent(session.id, type, meta),
  });
  // merge site metrics into completeSession()
}
```

### Backward compatibility

- `DRY_RUN=true`: use `FAST_BEHAVIOUR_CONFIG` (short scan, no reformulation, always click) so smoke tests stay fast.
- `session:test --query`: still accepts explicit query as **initial** query; journey may reformulate from there.
- Legacy `engagement:` weights in experiment YAML: map to persona overrides or deprecate in favour of personas (document migration).

---

## Action Tree Helper

```typescript
// src/behaviour/action-tree.ts

export function pickBranch<T extends string>(
  branches: Record<T, number>,
  random = Math.random(),
): T {
  const entries = Object.entries(branches) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let cursor = random * total;
  for (const [name, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return name;
  }
  return entries[entries.length - 1]![0];
}

export function normalizeWeights<T extends string>(
  branches: Record<T, number>,
): Record<T, number> {
  const total = Object.values(branches).reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    Object.entries(branches).map(([k, v]) => [k, v / total]),
  ) as Record<T, number>;
}
```

Reuses the same pattern as `selectEngagementTemplate()` and `selectWeightedQuery()`.

---

## Measurement & Analytics

### Expected outcome distribution (default persona mix)

With default weights and no experiment override, approximate **search group** outcomes:

| Outcome | Expected share |
|---------|----------------|
| `completed` (target clicked + site journey) | ~55–65% |
| `target_not_found` | ~15–25% |
| `search_abandoned` | ~5–10% |
| `target_found_no_click` | ~8–12% |
| `blocked` | varies (mobile low, desktop higher) |

Tune persona `target_click_probability_if_found` and `reformulate_probability` to hit experiment desired click-through rate.

### Metrics to track (dashboard / analysis)

- **Search CTR** = target clicks / searches submitted
- **Find rate** = target found / searches submitted
- **Click given find** = target clicks / targets found
- **Reformulation rate** = sessions with 2+ queries / all search sessions
- **Abandonment rate** = search_abandoned / all search sessions
- **Avg search attempts** per session
- **Persona breakdown** of each metric

### GSC correlation notes

- Treatment signal weakens if click rate drops too low — monitor `completed` rate weekly.
- `target_not_found` remains a quality signal (geo/SERP/parser issues).
- `search_abandoned` and `target_found_no_click` are **valid human outcomes** — do not retry automatically.
- Log `personaId` + `sessionTraitsJson` on every session for cohort analysis.

---

## Implementation Phases

### Phase 1 — Foundation (do first)

- [ ] Add `config/personas.yml` + loader
- [ ] Add `personaId` to Identity schema + assignment on create
- [ ] Implement `session-traits.ts`
- [ ] Refactor `google-search.ts`: extract `typeAndSubmitQuery(persona, traits)`
- [ ] Wire traits into typing delays (immediate coherence win)
- [ ] Persist `personaId`, `sessionTraitsJson` on Session

### Phase 2 — SERP inspection

- [ ] Implement `serp-inspection.ts`
- [ ] Insert inspect step before `findTargetInSerp()` in new `search-journey.ts`
- [ ] Add `serp_scrolled`, `serp_inspected` events
- [ ] Session runner calls `runSearchJourney` but always clicks if found (no skip yet)

### Phase 3 — Probabilistic outcomes

- [ ] Add `search_abandoned`, `target_found_no_click` statuses
- [ ] Implement abandon + skip-click branches
- [ ] Add `target_skipped`, `search_abandoned` events
- [ ] Update dashboard/API to display new statuses

### Phase 4 — Query evolution

- [ ] Implement `query-evolution.ts` with refinement graph
- [ ] Multi-search loop in `search-journey.ts`
- [ ] Add `query_reformulated` event + `queriesUsedJson` on Session

### Phase 5 — Site journey

- [ ] Implement `site-journey.ts` with action tree
- [ ] Multi-internal-page support (up to `maxInternalPages × navigationDepth`)
- [ ] Back-to-SERP via `page.goBack()`
- [ ] Deprecate or map old engagement templates

### Phase 6 — Experiment overrides & polish

- [ ] `behaviour:` block in experiment YAML
- [ ] `scripts/assign-personas.ts` backfill
- [ ] Update HOW_IT_WORKS.md
- [ ] Acceptance tests with mock SERP for each outcome branch

---

## Testing Strategy

### Unit tests

- `personas.ts` — load YAML, filter by device, weighted assignment
- `session-traits.ts` — clamp ranges, seeded reproducibility
- `query-evolution.ts` — transition graph, no duplicate queries, respects cluster only
- `action-tree.ts` — normalize weights, pick branch

### Integration tests (DRY_RUN)

```bash
# Force persona via env or flag for deterministic tests
BEHAVIOUR_PERSONA=normal_researcher DRY_RUN=true npm run session:test -- ...
```

- Mock SERP scenarios: target at position 8, target absent, target present on page 2
- Assert event sequences for each outcome branch

### Manual validation

Re-run theequestrian test with `normal_researcher` persona on `au_008`:
- Should see `serp_inspected` event before `target_found`
- Session duration similar or slightly longer than current ~9 min
- Status still `completed` with click

---

## Configuration Reference

### Environment variables (no new required vars)

Optional debug overrides:

```bash
BEHAVIOUR_PERSONA=deep_researcher     # force persona for session:test
BEHAVIOUR_SKIP_PROBABILISTIC=true      # always click if found (legacy mode)
```

### File locations summary

```
config/
  personas.yml                         # NEW — default persona library

src/behaviour/
  types.ts                             # NEW
  personas.ts                          # NEW
  session-traits.ts                    # NEW
  action-tree.ts                       # NEW
  serp-inspection.ts                   # NEW
  query-evolution.ts                   # NEW
  search-journey.ts                    # NEW
  site-journey.ts                      # NEW

src/browser/
  google-search.ts                     # REFACTOR — extract typing primitive
  engagement.ts                        # KEEP — scroll/dwell primitives
  serp-parser.ts                       # KEEP

src/sessions/
  session-runner.ts                    # REFACTOR — orchestrate behaviour engine

prisma/schema.prisma                   # MIGRATE — persona + new statuses/events
```

---

## Open Questions (decide before Phase 3)

1. **Retry policy** — should `search_abandoned` or `target_found_no_click` be retried by the worker? **Recommendation: no.**
2. **Scheduled query vs journey** — scheduler picks initial query; reformulation is in-session only. **Recommendation: yes, keep current scheduler.**
3. **Direct group** — direct sessions use site-journey only (no search journey). **Recommendation: yes.**
4. **Minimum click rate guard** — experiment-level `min_target_click_rate` for reporting alerts only, not runtime enforcement. **Recommendation: yes.**

---

## Success Criteria

Behaviour engine is complete when:

1. Identities retain the same persona across 10+ sessions.
2. Search sessions show variable outcome mix (not 100% click when found).
3. Session event logs include SERP inspection before target click.
4. Query reformulation uses only experiment cluster queries.
5. Site sessions produce 1–3 pageviews with correlated dwell/scroll.
6. theequestrian + vendl manual tests pass with `completed` status on at least one persona each.
7. All new statuses appear correctly in dashboard session list.
