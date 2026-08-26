import { chromium, type Page, type Response } from "playwright";
import type { Experiment, Identity, TreatmentGroup } from "@prisma/client";
import { getEnv } from "../config/env.js";
import { createBrowserProvider, getMockBrowserProvider } from "../providers/browser/index.js";
import { createProxyProvider } from "../providers/proxy/index.js";
import {
  defaultEngagementWeights,
  selectEngagementTemplate,
} from "../experiments/experiment-service.js";
import { updateIdentityStats } from "../identities/identity-service.js";
import { runDirectFlow, runSearchFlow } from "../browser/google-search.js";
import { runEngagement } from "../browser/engagement.js";
import { hashValue } from "../utils/helpers.js";
import {
  appendSessionEvent,
  completeSession,
  createSessionRecord,
} from "./session-logger.js";

export interface RunSessionInput {
  experiment: Experiment;
  identity: Identity;
  queryText: string;
  group?: TreatmentGroup;
  scheduledSessionId?: string;
  engagementWeights?: Record<string, number>;
}

export interface RunSessionResult {
  sessionId: string;
  status: string;
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

export async function runSession(input: RunSessionInput): Promise<RunSessionResult> {
  const env = getEnv();
  const group = input.group ?? "search";
  const engagementTemplate = selectEngagementTemplate(
    input.engagementWeights ?? defaultEngagementWeights(),
  );

  const session = await createSessionRecord({
    experimentId: input.experiment.id,
    identityId: input.identity.id,
    queryText: input.queryText,
    group,
    scheduledSessionId: input.scheduledSessionId,
    engagementTemplate,
  });

  const browserProvider = createBrowserProvider();
  const proxyProvider = createProxyProvider();
  let proxyLeaseId: string | null = null;
  let runningBrowser: Awaited<ReturnType<typeof browserProvider.startProfile>> | null = null;

  try {
    await appendSessionEvent(session.id, "browser_started", {
      identityId: input.identity.externalId,
      group,
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

    let page: Page;
    if (runningBrowser.context) {
      page = runningBrowser.context.pages()[0] ?? (await runningBrowser.context.newPage());
    } else if (runningBrowser.wsEndpoint) {
      const browser = await chromium.connectOverCDP(runningBrowser.wsEndpoint);
      const context = browser.contexts()[0] ?? (await browser.newContext());
      page = context.pages()[0] ?? (await context.newPage());
    } else {
      throw new Error("Browser provider did not return a usable browser");
    }

    const bandwidth = trackBandwidth(page);

    if (group === "none") {
      await completeSession(session.id, {
        status: "completed",
        durationSeconds: 0,
        bytesTransferred: BigInt(0),
      });
      return { sessionId: session.id, status: "completed" };
    }

    if (group === "direct") {
      const direct = await runDirectFlow(page, input.experiment.targetUrl);
      if (direct.blocked) {
        await completeSession(session.id, {
          status: "blocked",
          blockReason: direct.blockReason,
          landingUrl: direct.landingUrl,
          bytesTransferred: BigInt(bandwidth.getTotal()),
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
      const engagement = await runEngagement(
        page,
        engagementTemplate,
        undefined,
        () => appendSessionEvent(session.id, "scroll"),
        () => appendSessionEvent(session.id, "internal_click"),
      );

      await completeSession(session.id, {
        status: "completed",
        landingUrl: direct.landingUrl,
        finalUrl: page.url(),
        targetClicked: false,
        pageviews: engagement.pageviews,
        internalClicks: engagement.internalClicks,
        scrollDepth: engagement.scrollDepth,
        durationSeconds: engagement.durationSeconds,
        bytesTransferred: BigInt(bandwidth.getTotal()),
      });
      await appendSessionEvent(session.id, "session_completed");
      await updateIdentityStats(input.identity.id, {
        experimentId: input.experiment.id,
        query: input.queryText,
      });
      return { sessionId: session.id, status: "completed" };
    }

    const search = await runSearchFlow({
      page,
      query: input.queryText,
      targetDomain: input.experiment.targetDomain,
      maxSerpPages: input.experiment.maxSerpPages,
    });

    if (search.googleLoaded) {
      await appendSessionEvent(session.id, "google_loaded");
    }
    if (search.searchSubmitted) {
      await appendSessionEvent(session.id, "search_submitted", { query: input.queryText });
      await appendSessionEvent(session.id, "serp_loaded");
    }

    if (search.blocked) {
      await completeSession(session.id, {
        status: "blocked",
        blockReason: search.blockReason,
        googleLoaded: search.googleLoaded,
        searchSubmitted: search.searchSubmitted,
        proxyProvider: env.PROXY_PROVIDER,
        proxyCountry: "AU",
        proxyRegion: input.identity.region,
        proxyCity: input.identity.city,
        proxyIpHash: hashValue(`${proxyLease.host}:${proxyLease.sessionKey}`),
        bytesTransferred: BigInt(bandwidth.getTotal()),
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

    if (!search.targetFound) {
      await completeSession(session.id, {
        status: "target_not_found",
        googleLoaded: search.googleLoaded,
        searchSubmitted: search.searchSubmitted,
        targetFound: false,
        proxyProvider: env.PROXY_PROVIDER,
        proxyCountry: "AU",
        proxyRegion: input.identity.region,
        proxyCity: input.identity.city,
        proxyIpHash: hashValue(`${proxyLease.host}:${proxyLease.sessionKey}`),
        bytesTransferred: BigInt(bandwidth.getTotal()),
      });
      await updateIdentityStats(input.identity.id, {
        googleSession: true,
        experimentId: input.experiment.id,
        query: input.queryText,
      });
      return { sessionId: session.id, status: "target_not_found" };
    }

    await appendSessionEvent(session.id, "target_found", {
      position: search.observedPosition,
      serpPage: search.serpPage,
    });

    if (search.targetClicked) {
      await appendSessionEvent(session.id, "target_clicked", {
        url: search.resultUrl,
        title: search.resultTitle,
      });
      await appendSessionEvent(session.id, "landing_loaded", { url: search.landingUrl });
    }

    const engagement = await runEngagement(
      page,
      engagementTemplate,
      undefined,
      () => appendSessionEvent(session.id, "scroll"),
      () => appendSessionEvent(session.id, "internal_click"),
    );

    await completeSession(session.id, {
      status: "completed",
      googleLoaded: search.googleLoaded,
      searchSubmitted: search.searchSubmitted,
      targetFound: search.targetFound,
      serpPage: search.serpPage,
      observedPosition: search.observedPosition,
      resultTitle: search.resultTitle,
      resultUrl: search.resultUrl,
      targetClicked: search.targetClicked,
      landingUrl: search.landingUrl,
      finalUrl: page.url(),
      pageviews: engagement.pageviews,
      internalClicks: engagement.internalClicks,
      scrollDepth: engagement.scrollDepth,
      durationSeconds: engagement.durationSeconds,
      proxyProvider: env.PROXY_PROVIDER,
      proxyCountry: "AU",
      proxyRegion: input.identity.region,
      proxyCity: input.identity.city,
      proxyIpHash: hashValue(`${proxyLease.host}:${proxyLease.sessionKey}`),
      bytesTransferred: BigInt(bandwidth.getTotal()),
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
    await completeSession(session.id, {
      status: "browser_error",
      errorMessage: message,
      errorCode: "browser_error",
    });
    await appendSessionEvent(session.id, "error", { message });
    return { sessionId: session.id, status: "browser_error" };
  } finally {
    if (runningBrowser) {
      await browserProvider.stopProfile(
        input.identity.externalProfileId!,
        runningBrowser,
      ).catch(() => undefined);
    }
    if (proxyLeaseId) {
      await proxyProvider.release(proxyLeaseId).catch(() => undefined);
    }
  }
}
