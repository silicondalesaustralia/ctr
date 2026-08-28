import { chromium, type Page, type Response } from "playwright";
import type { Identity, SessionEventType, WarmupSessionKind } from "@prisma/client";
import { getPersonaForIdentity } from "../behaviour/personas.js";
import { generateSessionTraits, traitsToJson } from "../behaviour/session-traits.js";
import { runSiteJourney } from "../behaviour/site-journey.js";
import { inspectSerp } from "../behaviour/serp-inspection.js";
import { clickRandomOrganicResult } from "../browser/warmup-serp.js";
import { checkBlocked, openGoogle, typeAndSubmitQuery } from "../browser/google-search.js";
import { getEnv } from "../config/env.js";
import { createBrowserProvider, getMockBrowserProvider } from "../providers/browser/index.js";
import { createProxyProvider } from "../providers/proxy/index.js";
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
  extra?: { googleLoaded?: boolean; searchSubmitted?: boolean },
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
  });
}

export async function runWarmupSession(
  input: RunWarmupSessionInput,
): Promise<RunWarmupSessionResult> {
  const env = getEnv();
  const isGraduation = input.kind === "graduation";
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

    const proxyLease = await proxyProvider.allocate({
      country: "AU",
      region: input.identity.region,
      city: input.identity.city,
      sessionKey: input.identity.externalId,
      deviceClass: input.identity.deviceClass,
    });
    proxyLeaseId = proxyLease.leaseId;

    runningBrowser = await browserProvider.startProfile(profileId, {
      host: proxyLease.host,
      port: proxyLease.port,
      username: proxyLease.username,
      password: proxyLease.password,
      country: proxyLease.country,
      region: proxyLease.region,
      city: proxyLease.city,
      sessionKey: proxyLease.sessionKey,
    });
    cloudStarted = useGoLogin;

    let page: Page;
    if (runningBrowser.context) {
      page = runningBrowser.context.pages()[0] ?? (await runningBrowser.context.newPage());
    } else if (runningBrowser.wsEndpoint) {
      connectedBrowser = await connectBrowserWithRetry(runningBrowser.wsEndpoint);
      const context = connectedBrowser.contexts()[0] ?? (await connectedBrowser.newContext());
      page = context.pages()[0] ?? (await context.newPage());
    } else {
      throw new Error("Browser provider did not return a usable browser");
    }

    const bandwidth = trackBandwidth(page);
    const onEvent = async (eventType: SessionEventType, metadata?: Record<string, unknown>) => {
      await appendSessionEvent(session.id, eventType, metadata);
    };

    if (env.DRY_RUN) {
      await completeSession(session.id, {
        status: "completed",
        googleLoaded: true,
        searchSubmitted: true,
        durationSeconds: 5,
        bytesTransferred: BigInt(0),
        personaId: persona.id,
        sessionTraitsJson: traitsToJson(sessionTraits),
      });
      await recordWarmupSessionResult(input.identity.id, {
        kind: input.kind,
        blocked: false,
        siteClicked: !isGraduation,
        queryText: input.queryText,
      });
      return {
        sessionId: session.id,
        status: "completed",
        siteClicked: !isGraduation,
      };
    }

    await openGoogle(page);
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
        { googleLoaded: true },
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
        { googleLoaded: true, searchSubmitted: true },
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
        proxyProvider: env.PROXY_PROVIDER,
        proxyCountry: "AU",
        proxyRegion: input.identity.region,
        proxyCity: input.identity.city,
        proxyIpHash: hashValue(`${proxyLease.host}:${proxyLease.sessionKey ?? "unknown"}`),
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
      proxyProvider: env.PROXY_PROVIDER,
      proxyCountry: "AU",
      proxyRegion: input.identity.region,
      proxyCity: input.identity.city,
      proxyIpHash: hashValue(`${proxyLease.host}:${proxyLease.sessionKey ?? "unknown"}`),
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
    await completeSession(session.id, {
      status: "browser_error",
      errorMessage: message,
      errorCode: "browser_error",
      personaId: persona.id,
    });
    await appendSessionEvent(session.id, "error", { message });
    return { sessionId: session.id, status: "browser_error", siteClicked: false };
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
