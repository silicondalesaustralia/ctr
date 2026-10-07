import { chromium, type Page, type Response } from "../browser/pw.js";
import type { Identity, SessionEventType, WarmupSessionKind } from "@prisma/client";
import { getPersonaForIdentity } from "../behaviour/personas.js";
import { generateSessionTraits, traitsToJson } from "../behaviour/session-traits.js";
import { runSiteJourney } from "../behaviour/site-journey.js";
import { inspectSerp } from "../behaviour/serp-inspection.js";
import { verifyBrowserEgressGeo } from "../browser/egress-geo.js";
import { assertEgressPrefixClean } from "../providers/proxy/ip-reputation.js";
import { egressCityFor } from "./clean-lease.js";
import { browseAuSites, browseAuSitesBeforeGoogle } from "../browser/pre-google-browse.js";
import { applyBrowserStealth } from "../browser/stealth.js";
import { clickRandomOrganicResult } from "../browser/warmup-serp.js";
import { checkBlocked, openGoogle, typeAndSubmitQuery } from "../browser/google-search.js";
import { googleTargetFor } from "../geo/google-target.js";
import { getEnv, isDryRun } from "../config/env.js";
import { createBrowserProvider, getMockBrowserProvider } from "../providers/browser/index.js";
import { createProxyProvider, proxyProviderNameFor } from "../providers/proxy/index.js";
import { startBrowserWithLeaseRetry } from "./start-browser-with-lease.js";
import { hashValue, sleep } from "../utils/helpers.js";
import {
  appendSessionEvent,
  completeSession,
  createSessionRecord,
  updateSessionRecord,
} from "../sessions/session-logger.js";
import {
  cleanupBrowserSession,
  clearSessionCleanup,
  registerSessionCleanup,
  type BrowserCleanupRefs,
} from "../sessions/session-cleanup.js";
import { recordWarmupSessionResult } from "../warmup/warmup-service.js";
import { getWarmupExperiment } from "../warmup/warmup-experiment.js";
import { classifyBrowserErrorCode, mapErrorStatus } from "../scheduler/retry-policy.js";

export interface RunWarmupSessionInput {
  identity: Identity;
  queryText: string;
  warmupSessionId: string;
  kind: WarmupSessionKind;
}

export interface RunWarmupSessionResult {
  sessionId: string;
  status: string;
  siteClicked: boolean;
}

async function connectBrowserWithRetry(wsEndpoint: string, maxAttempts = 4) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await chromium.connectOverCDP(wsEndpoint, { timeout: 15_000 });
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(3000);
      }
    }
  }
  throw lastError;
}

function trackBandwidth(page: Page): { getTotal: () => number } {
  let total = 0;
  const handler = (response: Response) => {
    const length = Number(response.headers()["content-length"] ?? 0);
    if (Number.isFinite(length) && length > 0) {
      total += length;
    }
  };
  page.on("response", handler);
  return { getTotal: () => total };
}

async function finishBlocked(
  sessionId: string,
  identityId: string,
  kind: WarmupSessionKind,
  queryText: string,
  reason: string | undefined,
  bandwidth: ReturnType<typeof trackBandwidth>,
  personaId: string,
  extra?: { googleLoaded?: boolean; searchSubmitted?: boolean; egressIp?: string },
) {
  await completeSession(sessionId, {
    status: "blocked",
    blockReason: reason,
    googleLoaded: extra?.googleLoaded ?? false,
    searchSubmitted: extra?.searchSubmitted ?? false,
    bytesTransferred: BigInt(bandwidth.getTotal()),
    personaId,
  });
  await appendSessionEvent(sessionId, "blocked", { reason, warmup: true, kind });
  await recordWarmupSessionResult(identityId, {
    kind,
    blocked: true,
    siteClicked: false,
    queryText,
    egressIp: extra?.egressIp,
  });
}

export async function runWarmupSession(
  input: RunWarmupSessionInput,
): Promise<RunWarmupSessionResult> {
  const env = getEnv();
  const isGraduation = input.kind === "graduation";
  const isBrowse = input.kind === "browse";
  const warmupExperiment = await getWarmupExperiment();
  const persona = await getPersonaForIdentity(input.identity);
  const session = await createSessionRecord({
    experimentId: warmupExperiment.id,
    identityId: input.identity.id,
    queryText: input.queryText,
    group: "search",
    personaId: persona.id,
  });

  const sessionTraits = generateSessionTraits(
    persona,
    session.id,
    input.identity.externalId,
  );

  await updateSessionRecord(session.id, {
    sessionTraitsJson: traitsToJson(sessionTraits),
  });

  const browserProvider = createBrowserProvider();
  const proxyProvider = createProxyProvider();
  let proxyLeaseId: string | null = null;
  let runningBrowser: Awaited<ReturnType<typeof browserProvider.startProfile>> | null = null;
  let connectedBrowser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;
  let cloudStarted = false;
  const useGoLogin = env.BROWSER_PROFILE_PROVIDER === "gologin";

  const cleanupRefs: BrowserCleanupRefs = {
    connectedBrowser: null,
    runningBrowser: null,
    profileId: input.identity.externalProfileId,
    cloudStarted: false,
    useGoLogin,
    browserProvider,
    proxyLeaseId: null,
    proxyProvider,
  };

  registerSessionCleanup(async () => {
    cleanupRefs.connectedBrowser = connectedBrowser;
    cleanupRefs.runningBrowser = runningBrowser;
    cleanupRefs.cloudStarted = cloudStarted;
    cleanupRefs.proxyLeaseId = proxyLeaseId;
    await cleanupBrowserSession(cleanupRefs);
  });

  let siteClicked = false;

  try {
    await appendSessionEvent(session.id, "browser_started", {
      identityId: input.identity.externalId,
      warmup: true,
      kind: input.kind,
    });

    const profileId = input.identity.externalProfileId;
    if (!profileId) {
      throw new Error("Identity has no external profile ID");
    }

    if (env.BROWSER_PROFILE_PROVIDER === "mock") {
      getMockBrowserProvider().registerExistingProfile({
        profileId,
        provider: input.identity.profileProvider,
        name: input.identity.externalId,
        deviceClass: input.identity.deviceClass,
        osFamily: input.identity.osFamily,
        locale: input.identity.locale,
        timezone: input.identity.timezone,
        region: input.identity.region,
        city: input.identity.city,
      });
    }

    const started = await startBrowserWithLeaseRetry({
      proxyProvider,
      browserProvider,
      profileId,
      allocation: {
        country: input.identity.country,
        region: input.identity.region,
        city: input.identity.city,
        sessionKey: session.id,
        deviceClass: input.identity.deviceClass,
      },
      timezone: input.identity.timezone,
      locale: input.identity.locale,
      onLease: (leaseId) => {
        proxyLeaseId = leaseId;
      },
      onRunning: (running) => {
        runningBrowser = running;
        cloudStarted = useGoLogin && running?.runtime === "cloud";
      },
      prepare: async (running) => {
        let openedPage: Page;
        if (running.context) {
          openedPage = running.context.pages()[0] ?? (await running.context.newPage());
        } else if (running.wsEndpoint) {
          connectedBrowser = await connectBrowserWithRetry(running.wsEndpoint);
          const context = connectedBrowser.contexts()[0] ?? (await connectedBrowser.newContext());
          openedPage = context.pages()[0] ?? (await context.newPage());
        } else {
          throw new Error("Browser provider did not return a usable browser");
        }
        if (running.runtime !== "camoufox") {
          await applyBrowserStealth(openedPage);
        }
        if (isDryRun() || env.PROXY_PROVIDER === "mock") {
          return { page: openedPage, egress: undefined };
        }
        const expectedCity = egressCityFor(input.identity.city, input.identity.deviceClass);
        const verified = await verifyBrowserEgressGeo(openedPage, input.identity.country, expectedCity);
        if (!isBrowse) await assertEgressPrefixClean(verified.ip, input.identity.deviceClass === "mobile");
        return { page: openedPage, egress: verified };
      },
      discard: async (running) => {
        await cleanupBrowserSession({
          ...cleanupRefs,
          connectedBrowser,
          runningBrowser: running,
          cloudStarted: useGoLogin && running.runtime === "cloud",
          proxyLeaseId: null,
        });
        connectedBrowser = null;
      },
    });
    const proxyLease = started.lease;
    const { page, egress } = started.prepared;

    const bandwidth = trackBandwidth(page);
    let egressCountry = input.identity.country;
    let egressRegion = input.identity.region;
    let egressCity = input.identity.city;
    let egressIpHash = hashValue(`${proxyLease.host}:${proxyLease.sessionKey ?? "unknown"}`);
    let egressIp: string | undefined;
    if (egress) {
      egressIp = egress.ip;
      egressCountry = egress.country;
      egressRegion = egress.region ?? input.identity.region;
      egressCity = egress.city ?? input.identity.city;
      egressIpHash = hashValue(egress.ip);
      await updateSessionRecord(session.id, {
        proxyProvider: proxyProviderNameFor(input.identity.deviceClass),
        proxyCountry: egressCountry,
        proxyRegion: egressRegion,
        proxyCity: egressCity,
        proxyIpHash: egressIpHash,
      });
    }
    const onEvent = async (eventType: SessionEventType, metadata?: Record<string, unknown>) => {
      await appendSessionEvent(session.id, eventType, metadata);
    };

    if (env.DRY_RUN) {
      await completeSession(session.id, {
        status: "completed",
        googleLoaded: !isBrowse,
        searchSubmitted: !isBrowse,
        durationSeconds: 5,
        bytesTransferred: BigInt(0),
        personaId: persona.id,
        sessionTraitsJson: traitsToJson(sessionTraits),
      });
      await recordWarmupSessionResult(input.identity.id, {
        kind: input.kind,
        blocked: false,
        siteClicked: isBrowse || !isGraduation,
        queryText: input.queryText,
      });
      return {
        sessionId: session.id,
        status: "completed",
        siteClicked: isBrowse || !isGraduation,
      };
    }

    if (isBrowse) {
      const sites = await browseAuSites(page, {
        minSites: 2,
        maxSites: 4,
        longDwell: true,
        country: input.identity.country,
      });
      await appendSessionEvent(session.id, "scroll", {
        warmup: true,
        phase: "cookie_age_browse",
        sites,
      });
      await completeSession(session.id, {
        status: "completed",
        googleLoaded: false,
        searchSubmitted: false,
        durationSeconds: 0,
        bytesTransferred: BigInt(bandwidth.getTotal()),
        proxyProvider: proxyProviderNameFor(input.identity.deviceClass),
        proxyCountry: egressCountry,
        proxyRegion: egressRegion,
        proxyCity: egressCity,
        proxyIpHash: egressIpHash,
        personaId: persona.id,
        sessionTraitsJson: traitsToJson(sessionTraits),
      });
      await appendSessionEvent(session.id, "session_completed", {
        warmup: true,
        kind: "browse",
        sites,
      });
      await recordWarmupSessionResult(input.identity.id, {
        kind: "browse",
        blocked: false,
        siteClicked: true,
        queryText: input.queryText,
      });
      return { sessionId: session.id, status: "completed", siteClicked: true };
    }

    const preSites = await browseAuSitesBeforeGoogle(page, input.identity.country);
    await appendSessionEvent(session.id, "scroll", {
      warmup: true,
      phase: "pre_google_browse",
      sites: preSites,
    });

    await openGoogle(page, googleTargetFor(input.identity.country, input.identity.locale));
    await appendSessionEvent(session.id, "google_loaded");

    const blockedAfterLoad = await checkBlocked(page);
    if (blockedAfterLoad.blocked) {
      await finishBlocked(
        session.id,
        input.identity.id,
        input.kind,
        input.queryText,
        blockedAfterLoad.reason,
        bandwidth,
        persona.id,
        { googleLoaded: true, egressIp },
      );
      return { sessionId: session.id, status: "blocked", siteClicked: false };
    }

    await typeAndSubmitQuery(page, input.queryText, persona, sessionTraits);
    await appendSessionEvent(session.id, "search_submitted", {
      query: input.queryText,
      warmup: true,
      kind: input.kind,
    });
    await appendSessionEvent(session.id, "serp_loaded");

    const blockedAfterSearch = await checkBlocked(page);
    if (blockedAfterSearch.blocked) {
      await finishBlocked(
        session.id,
        input.identity.id,
        input.kind,
        input.queryText,
        blockedAfterSearch.reason,
        bandwidth,
        persona.id,
        { googleLoaded: true, searchSubmitted: true, egressIp },
      );
      return { sessionId: session.id, status: "blocked", siteClicked: false };
    }

    await inspectSerp(page, persona, sessionTraits, onEvent);

    if (isGraduation) {
      await completeSession(session.id, {
        status: "completed",
        googleLoaded: true,
        searchSubmitted: true,
        durationSeconds: 0,
        bytesTransferred: BigInt(bandwidth.getTotal()),
        proxyProvider: proxyProviderNameFor(input.identity.deviceClass),
        proxyCountry: egressCountry,
        proxyRegion: egressRegion,
        proxyCity: egressCity,
        proxyIpHash: egressIpHash,
        personaId: persona.id,
        sessionTraitsJson: traitsToJson(sessionTraits),
      });
      await appendSessionEvent(session.id, "session_completed", {
        warmup: true,
        kind: "graduation",
      });
      await recordWarmupSessionResult(input.identity.id, {
        kind: "graduation",
        blocked: false,
        siteClicked: false,
        queryText: input.queryText,
      });
      return { sessionId: session.id, status: "completed", siteClicked: false };
    }

    let landingUrl: string | undefined;
    let durationSeconds = 0;
    let pageviews = 0;
    let internalClicks = 0;
    let scrollDepth = 0;

    const clicked = await clickRandomOrganicResult(page);
    if (clicked) {
      siteClicked = true;
      landingUrl = page.url();
      await appendSessionEvent(session.id, "target_clicked", {
        title: clicked.title,
        url: clicked.url,
        warmup: true,
      });
      await appendSessionEvent(session.id, "landing_loaded", { url: landingUrl });

      const site = await runSiteJourney({
        page,
        persona,
        traits: sessionTraits,
        onEvent,
      });
      durationSeconds = site.durationSeconds;
      pageviews = site.pageviews;
      internalClicks = site.internalClicks;
      scrollDepth = site.scrollDepth;
    }

    await completeSession(session.id, {
      status: "completed",
      googleLoaded: true,
      searchSubmitted: true,
      targetClicked: siteClicked,
      landingUrl,
      pageviews,
      internalClicks,
      scrollDepth,
      durationSeconds,
      bytesTransferred: BigInt(bandwidth.getTotal()),
      proxyProvider: proxyProviderNameFor(input.identity.deviceClass),
      proxyCountry: egressCountry,
      proxyRegion: egressRegion,
      proxyCity: egressCity,
      proxyIpHash: egressIpHash,
      personaId: persona.id,
      sessionTraitsJson: traitsToJson(sessionTraits),
    });
    await appendSessionEvent(session.id, "session_completed", { warmup: true, kind: "benign" });
    await recordWarmupSessionResult(input.identity.id, {
      kind: "benign",
      blocked: false,
      siteClicked,
      queryText: input.queryText,
    });

    return { sessionId: session.id, status: "completed", siteClicked };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorCode = classifyBrowserErrorCode(message);
    const status = mapErrorStatus(errorCode);
    await completeSession(session.id, {
      status,
      errorMessage: message,
      errorCode,
      personaId: persona.id,
    });
    await appendSessionEvent(session.id, "error", { message, errorCode });
    return { sessionId: session.id, status, siteClicked: false };
  } finally {
    cleanupRefs.connectedBrowser = connectedBrowser;
    cleanupRefs.runningBrowser = runningBrowser;
    cleanupRefs.cloudStarted = cloudStarted;
    cleanupRefs.proxyLeaseId = proxyLeaseId;
    try {
      await cleanupBrowserSession(cleanupRefs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[warmup] Browser cleanup failed: ${message}`);
    } finally {
      clearSessionCleanup();
    }
  }
}
