import { chromium, type Page, type Response } from "playwright";
import type { Experiment, Identity, SessionEventType, TreatmentGroup } from "@prisma/client";
import { loadBehaviourOverrides } from "../behaviour/experiment-behaviour.js";
import { getPersonaForIdentity } from "../behaviour/personas.js";
import { resolveInitialQuery } from "../behaviour/query-evolution.js";
import { runSearchJourney } from "../behaviour/search-journey.js";
import { runGmbSearchJourney } from "../behaviour/gmb-journey.js";
import { generateSessionTraits, traitsToJson } from "../behaviour/session-traits.js";
import { runSiteJourney } from "../behaviour/site-journey.js";
import { verifyBrowserEgressGeo, type EgressGeo } from "../browser/egress-geo.js";
import { getEnv, isDryRun } from "../config/env.js";
import { getExperimentQueries } from "../experiments/experiment-service.js";
import { updateIdentityStats } from "../identities/identity-service.js";
import { isWarmupEligible } from "../warmup/warmup-service.js";
import { parseActionsJson } from "../campaign/gmb-types.js";
import { runDirectFlow } from "../browser/google-search.js";
import { createBrowserProvider, getMockBrowserProvider } from "../providers/browser/index.js";
import { createProxyProvider } from "../providers/proxy/index.js";
import { hashValue, sleep } from "../utils/helpers.js";
import {
  appendSessionEvent,
  completeSession,
  createSessionRecord,
  updateSessionRecord,
} from "./session-logger.js";
import {
  cleanupBrowserSession,
  clearSessionCleanup,
  registerSessionCleanup,
  type BrowserCleanupRefs,
} from "./session-cleanup.js";
import { classifyBrowserErrorCode, mapErrorStatus } from "../scheduler/retry-policy.js";

export interface RunSessionInput {
  experiment: Experiment;
  identity: Identity;
  queryText: string;
  group?: TreatmentGroup;
  scheduledSessionId?: string;
}

export interface RunSessionResult {
  sessionId: string;
  status: string;
  errorCode?: string;
}

async function connectBrowserWithRetry(wsEndpoint: string, maxAttempts = 4) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.error(`[session] Cloud browser connect attempt ${attempt}/${maxAttempts}...`);
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
    const headers = response.headers();
    const length = Number(headers["content-length"] ?? 0);
    if (Number.isFinite(length) && length > 0) {
      total += length;
    }
  };
  page.on("response", handler);
  return {
    getTotal: () => total,
  };
}

function proxyFields(
  env: ReturnType<typeof getEnv>,
  identity: Identity,
  proxyLease: { host: string; sessionKey?: string },
  egress?: EgressGeo,
) {
  return {
    proxyProvider: env.PROXY_PROVIDER,
    proxyCountry: egress?.country ?? "AU",
    proxyRegion: egress?.region ?? identity.region,
    proxyCity: egress?.city ?? identity.city,
    proxyIpHash: hashValue(
      egress?.ip ?? `${proxyLease.host}:${proxyLease.sessionKey ?? "unknown"}`,
    ),
  };
}

export async function runSession(input: RunSessionInput): Promise<RunSessionResult> {
  const env = getEnv();
  const group = input.group ?? "search";
  const loadedOverrides = loadBehaviourOverrides(input.experiment.slug);
  const isScheduledCampaign =
    Boolean(input.scheduledSessionId) && input.experiment.slug !== "__warmup__";
  const behaviourOverrides = {
    ...loadedOverrides,
    allowTargetSkip:
      loadedOverrides.allowTargetSkip ?? (isScheduledCampaign ? false : true),
  };
  const persona = await getPersonaForIdentity(input.identity, behaviourOverrides);

  const session = await createSessionRecord({
    experimentId: input.experiment.id,
    identityId: input.identity.id,
    queryText: input.queryText,
    group,
    scheduledSessionId: input.scheduledSessionId,
    engagementTemplate: persona.id,
    personaId: persona.id,
  });

  if (
    input.experiment.requireWarmupIdentities &&
    input.experiment.slug !== "__warmup__" &&
    !isWarmupEligible(input.identity)
  ) {
    const message = `Identity ${input.identity.externalId} is not warmup-eligible (status=${input.identity.warmupStatus})`;
    console.error(`[session] ${message}`);
    await completeSession(session.id, {
      status: "cancelled",
      errorMessage: message,
      personaId: persona.id,
      sessionTraitsJson: traitsToJson(
        generateSessionTraits(persona, session.id, input.identity.externalId),
      ),
    });
    await appendSessionEvent(session.id, "error", { message, errorCode: "identity_not_warmed" });
    return { sessionId: session.id, status: "cancelled", errorCode: "identity_not_warmed" };
  }

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

  try {
    await appendSessionEvent(session.id, "browser_started", {
      identityId: input.identity.externalId,
      group,
      personaId: persona.id,
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
      sessionKey: session.id,
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
    // Only GoLogin *cloud* needs the remote /web stop path.
    cloudStarted = useGoLogin && runningBrowser.runtime === "cloud";

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
    let egress: EgressGeo | undefined;
    if (!isDryRun() && env.PROXY_PROVIDER !== "mock") {
      egress = await verifyBrowserEgressGeo(page, "AU");
    }
    const proxyMeta = proxyFields(env, input.identity, proxyLease, egress);
    if (egress) {
      await updateSessionRecord(session.id, proxyMeta);
    }

    if (group === "none") {
      await completeSession(session.id, {
        status: "completed",
        durationSeconds: 0,
        bytesTransferred: BigInt(0),
        personaId: persona.id,
        sessionTraitsJson: traitsToJson(sessionTraits),
      });
      return { sessionId: session.id, status: "completed" };
    }

    const onEvent = async (eventType: SessionEventType, metadata?: Record<string, unknown>) => {
      await appendSessionEvent(session.id, eventType, metadata);
    };

    if (group === "direct") {
      const direct = await runDirectFlow(page, input.experiment.targetUrl);
      if (direct.blocked) {
        await completeSession(session.id, {
          status: "blocked",
          blockReason: direct.blockReason,
          landingUrl: direct.landingUrl,
          bytesTransferred: BigInt(bandwidth.getTotal()),
          personaId: persona.id,
          sessionTraitsJson: traitsToJson(sessionTraits),
        });
        await appendSessionEvent(session.id, "blocked", { reason: direct.blockReason });
        await updateIdentityStats(input.identity.id, {
          blocked: true,
          experimentId: input.experiment.id,
          query: input.queryText,
        });
        return { sessionId: session.id, status: "blocked" };
      }

      await appendSessionEvent(session.id, "landing_loaded", { url: direct.landingUrl });
      const site = await runSiteJourney({
        page,
        persona,
        traits: sessionTraits,
        onEvent,
      });

      await completeSession(session.id, {
        status: "completed",
        landingUrl: direct.landingUrl,
        finalUrl: site.finalUrl,
        targetClicked: false,
        pageviews: site.pageviews,
        internalClicks: site.internalClicks,
        scrollDepth: site.scrollDepth,
        durationSeconds: site.durationSeconds,
        bytesTransferred: BigInt(bandwidth.getTotal()),
        personaId: persona.id,
        sessionTraitsJson: traitsToJson(sessionTraits),
        backToSerp: site.backToSerp,
      });
      await appendSessionEvent(session.id, "session_completed");
      await updateIdentityStats(input.identity.id, {
        experimentId: input.experiment.id,
        query: input.queryText,
      });
      return { sessionId: session.id, status: "completed" };
    }

    const cluster = await getExperimentQueries(input.experiment.id);
    const initialQuery = resolveInitialQuery(input.queryText, cluster);

    const search =
      input.experiment.campaignKind === "gmb"
        ? await runGmbSearchJourney({
            page,
            persona,
            traits: sessionTraits,
            query: initialQuery,
            businessName: input.experiment.gmbBusinessName ?? input.experiment.name,
            placeId: input.experiment.gmbPlaceId,
            actions: parseActionsJson(input.experiment.gmbActionsJson),
            onEvent,
          })
        : await runSearchJourney({
            page,
            persona,
            traits: sessionTraits,
            cluster,
            initialQuery,
            targetDomain: input.experiment.targetDomain,
            targetUrl: input.experiment.targetUrl,
            maxSerpPages: input.experiment.maxSerpPages,
            behaviourOverrides,
            onEvent,
          });

    const queriesUsed = search.searches.map((attempt) => attempt.queryText);
    const commonFields = {
      googleLoaded: search.googleLoaded,
      searchSubmitted: search.searchSubmitted,
      targetFound: search.targetFound,
      targetClicked: search.targetClicked,
      targetSkipped: search.targetSkipped,
      serpPage: search.serpPage,
      observedPosition: search.observedPosition,
      resultTitle: search.resultTitle,
      resultUrl: search.resultUrl,
      landingUrl: search.landingUrl,
      searchAttempts: search.searches.length,
      queriesUsedJson: JSON.stringify(queriesUsed),
      personaId: persona.id,
      sessionTraitsJson: traitsToJson(sessionTraits),
      ...proxyMeta,
      bytesTransferred: BigInt(bandwidth.getTotal()),
    };

    if (search.status === "blocked") {
      await completeSession(session.id, {
        status: "blocked",
        blockReason: search.blockReason,
        ...commonFields,
      });
      await appendSessionEvent(session.id, "blocked", { reason: search.blockReason });
      await updateIdentityStats(input.identity.id, {
        blocked: true,
        googleSession: true,
        experimentId: input.experiment.id,
        query: input.queryText,
      });
      return { sessionId: session.id, status: "blocked" };
    }

    if (search.status === "search_abandoned") {
      await completeSession(session.id, {
        status: "search_abandoned",
        durationSeconds: 0,
        ...commonFields,
      });
      await updateIdentityStats(input.identity.id, {
        googleSession: true,
        experimentId: input.experiment.id,
        query: input.queryText,
      });
      return { sessionId: session.id, status: "search_abandoned" };
    }

    if (search.status === "target_found_no_click") {
      await completeSession(session.id, {
        status: "target_found_no_click",
        durationSeconds: 0,
        ...commonFields,
      });
      await updateIdentityStats(input.identity.id, {
        googleSession: true,
        experimentId: input.experiment.id,
        query: input.queryText,
      });
      return { sessionId: session.id, status: "target_found_no_click" };
    }

    if (search.status === "target_not_found") {
      await completeSession(session.id, {
        status: "target_not_found",
        durationSeconds: 0,
        ...commonFields,
      });
      await updateIdentityStats(input.identity.id, {
        googleSession: true,
        experimentId: input.experiment.id,
        query: input.queryText,
      });
      return { sessionId: session.id, status: "target_not_found" };
    }

    if (search.landingUrl) {
      await appendSessionEvent(session.id, "landing_loaded", { url: search.landingUrl });
    }

    const site = await runSiteJourney({
      page,
      persona,
      traits: sessionTraits,
      onEvent,
    });

    await completeSession(session.id, {
      status: "completed",
      finalUrl: site.finalUrl,
      pageviews: site.pageviews,
      internalClicks: site.internalClicks,
      scrollDepth: site.scrollDepth,
      durationSeconds: site.durationSeconds,
      backToSerp: site.backToSerp,
      ...commonFields,
    });

    await appendSessionEvent(session.id, "session_completed");
    await updateIdentityStats(input.identity.id, {
      googleSession: true,
      targetClicked: true,
      experimentId: input.experiment.id,
      query: input.queryText,
    });

    return { sessionId: session.id, status: "completed" };
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
    return { sessionId: session.id, status, errorCode };
  } finally {
    cleanupRefs.connectedBrowser = connectedBrowser;
    cleanupRefs.runningBrowser = runningBrowser;
    cleanupRefs.cloudStarted = cloudStarted;
    cleanupRefs.proxyLeaseId = proxyLeaseId;
    try {
      await cleanupBrowserSession(cleanupRefs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[session] Browser cleanup failed: ${message}`);
    } finally {
      clearSessionCleanup();
    }
  }
}
