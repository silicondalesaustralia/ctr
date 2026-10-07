import { chromium, type Page } from "../browser/pw.js";
import type { Identity } from "@prisma/client";
import { FAST_DRY_RUN_PERSONA } from "../behaviour/personas.js";
import { generateSessionTraits } from "../behaviour/session-traits.js";
import {
  checkBlocked,
  loadDryRunSerp,
  openGoogle,
  typeAndSubmitQuery,
} from "../browser/google-search.js";
import { findTargetInSerp, findTargetOnCurrentPage } from "../browser/serp-parser.js";
import { assertSerpHasResults, GoogleBlockedError } from "../browser/blocked-detection.js";
import { RESULT_TITLE_SELECTOR } from "../browser/serp-pagination.js";
import { registerGoogleBlock } from "../identities/block-policy.js";
import { startBrowserWithLeaseRetry } from "../sessions/start-browser-with-lease.js";
import { verifyBrowserEgressGeo } from "../browser/egress-geo.js";
import { egressCityFor } from "../sessions/clean-lease.js";
import { getEnv, isDryRun } from "../config/env.js";
import { prisma } from "../db/client.js";
import { createBrowserProvider, getMockBrowserProvider } from "../providers/browser/index.js";
import { isValidGoLoginProfileId } from "../providers/browser/gologin-utils.js";
import { isIdentityRunnable } from "../identities/provider-compat.js";
import { updatePreflightJobProgress } from "./preflight-jobs.js";
import { rankByWarmth } from "./preflight-identity-rank.js";
import { preflightGeoPoint } from "../browser/google-geo-header.js";
import { googleTargetFor, type GoogleTarget } from "../geo/google-target.js";
import { checkGmbQueryOnPage } from "./gmb-preflight-check.js";
import { createProxyProvider } from "../providers/proxy/index.js";
import {
  cleanupBrowserSession,
  clearSessionCleanup,
  registerSessionCleanup,
  type BrowserCleanupRefs,
} from "../sessions/session-cleanup.js";
import { hashValue, randomBetween, sleep } from "../utils/helpers.js";
import type { PreflightQueryResult } from "./preflight-types.js";

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

export async function pickPreflightIdentity(
  region: string,
  identityExternalId?: string,
  city?: string | null,
  country?: string | null,
): Promise<Identity> {
  const requireGoLogin = getEnv().BROWSER_PROFILE_PROVIDER === "gologin";

  function assertGoLoginProfile(identity: Identity): Identity {
    if (requireGoLogin && !isValidGoLoginProfileId(identity.externalProfileId)) {
      throw new Error(
        `Identity ${identity.externalId} has an invalid GoLogin profile ID. Run: npm run gologin:repair`,
      );
    }
    return identity;
  }

  function filterPool(allIdentities: Identity[]): Identity[] {
    const identities = allIdentities.filter((identity) => isIdentityRunnable(identity));
    if (!requireGoLogin) return identities;
    const valid = identities.filter((identity) =>
      isValidGoLoginProfileId(identity.externalProfileId),
    );
    if (valid.length === 0) {
      throw new Error(
        "No identities with valid GoLogin profile IDs. Run: npm run gologin:repair",
      );
    }
    return valid;
  }

  if (identityExternalId) {
    const identity = await prisma.identity.findUnique({
      where: { externalId: identityExternalId },
    });
    if (!identity?.active) {
      throw new Error(`Identity not found or inactive: ${identityExternalId}`);
    }
    return assertGoLoginProfile(identity);
  }

  const countryCode = country?.trim().toUpperCase();
  const identities = filterPool(
    await prisma.identity.findMany({ where: { active: true, ...(countryCode && { country: countryCode }) } }),
  );
  if (identities.length === 0) {
    throw new Error(`No active identities available for Google preflight${countryCode ? ` in ${countryCode}` : ""}.`);
  }

  const cityPool = city?.trim()
    ? identities.filter((identity) => identity.city === city.trim())
    : [];
  const focusRegion = region === "ALL" ? null : region;
  const regional = focusRegion
    ? identities.filter((identity) => identity.region === focusRegion)
    : identities;
  const pool = cityPool.length > 0 ? cityPool : regional.length > 0 ? regional : identities;
  const desktop = rankByWarmth(pool.filter((identity) => identity.deviceClass === "desktop"));
  const pick = desktop[0] ?? rankByWarmth(pool)[0] ?? identities[0];
  if (!pick) {
    throw new Error("No active identities available for Google preflight.");
  }
  return pick;
}

async function checkQueryOnPage(
  page: Page,
  query: string,
  targetDomain: string,
  maxSerpPages: number,
  persona: typeof FAST_DRY_RUN_PERSONA,
  traits: ReturnType<typeof generateSessionTraits>,
  google: GoogleTarget,
): Promise<PreflightQueryResult> {
  try {
    if (isDryRun()) {
      await loadDryRunSerp(page, targetDomain, query);
      const result = await findTargetOnCurrentPage(page, targetDomain, 1);
      if (!result) {
        return {
          query,
          found: false,
          serpPage: null,
          position: null,
          globalPosition: null,
          status: "not_found",
        };
      }
      return {
        query,
        found: true,
        serpPage: result.serpPage,
        position: result.position,
        globalPosition: result.rank,
        status: "found",
      };
    }

    await openGoogle(page, google);
    const blockedAfterOpen = await checkBlocked(page);
    if (blockedAfterOpen.blocked) {
      return {
        query,
        found: false,
        serpPage: null,
        position: null,
        globalPosition: null,
        status: "blocked",
        errorMessage: blockedAfterOpen.reason,
      };
    }

    await typeAndSubmitQuery(page, query, persona, traits);
    const blockedAfterSearch = await checkBlocked(page);
    if (blockedAfterSearch.blocked) {
      return {
        query,
        found: false,
        serpPage: null,
        position: null,
        globalPosition: null,
        status: "blocked",
        errorMessage: blockedAfterSearch.reason,
      };
    }
    await assertSerpHasResults(page, RESULT_TITLE_SELECTOR);

    const { result, pagesSearched } = await findTargetInSerp(page, targetDomain, maxSerpPages);
    if (!result) {
      return {
        query,
        found: false,
        serpPage: pagesSearched,
        position: null,
        globalPosition: null,
        status: pagesSearched < maxSerpPages ? "limited" : "not_found",
      };
    }

    return {
      query,
      found: true,
      serpPage: result.serpPage,
      position: result.position,
      globalPosition: result.rank,
      status: "found",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      query,
      found: false,
      serpPage: null,
      position: null,
      globalPosition: null,
      status: error instanceof GoogleBlockedError ? "blocked" : "error",
      errorMessage: message,
    };
  }
}

export async function runSerpPreflightChecks(input: {
  queries: string[];
  targetUrl: string;
  targetDomain: string;
  region: string;
  maxSerpPages: number;
  identityExternalId?: string;
  jobId?: string;
  campaignKind?: "url" | "gmb";
  focusCity?: string | null;
  country?: string | null;
  gmbBusinessName?: string | null;
  gmbPlaceId?: string | null;
}): Promise<PreflightQueryResult[]> {
  const env = getEnv();
  const identity = await pickPreflightIdentity(
    input.region,
    input.identityExternalId,
    input.focusCity,
    input.country,
  );
  const persona = FAST_DRY_RUN_PERSONA;
  const traits = generateSessionTraits(persona, `preflight-${Date.now()}`, identity.externalId);

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
    profileId: identity.externalProfileId,
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

  const results: PreflightQueryResult[] = [];

  try {
    const profileId = identity.externalProfileId;
    if (!profileId) {
      throw new Error("Identity has no external profile ID");
    }

    if (env.BROWSER_PROFILE_PROVIDER === "mock") {
      getMockBrowserProvider().registerExistingProfile({
        profileId,
        provider: identity.profileProvider,
        name: identity.externalId,
        deviceClass: identity.deviceClass,
        osFamily: identity.osFamily,
        locale: identity.locale,
        timezone: identity.timezone,
        region: identity.region,
        city: identity.city,
      });
    }

    const started = await startBrowserWithLeaseRetry({
      proxyProvider,
      browserProvider,
      profileId,
      allocation: {
        country: identity.country,
        region: identity.region,
        city: identity.city,
        sessionKey: `preflight-${hashValue(`${input.targetUrl}:${Date.now()}`)}`,
        deviceClass: identity.deviceClass,
      },
      timezone: identity.timezone,
      locale: identity.locale,
      options: { googleGeoPoint: preflightGeoPoint(identity.country, input.region, input.focusCity) },
      onLease: (leaseId) => {
        proxyLeaseId = leaseId;
      },
      onRunning: (running) => {
        runningBrowser = running;
        cloudStarted = useGoLogin && running !== null;
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
        if (!isDryRun() && env.PROXY_PROVIDER !== "mock") {
          const expectedCity = egressCityFor(identity.city, identity.deviceClass);
          await verifyBrowserEgressGeo(openedPage, identity.country, expectedCity);
        }
        return openedPage;
      },
      discard: async (running) => {
        await cleanupBrowserSession({
          ...cleanupRefs,
          connectedBrowser,
          runningBrowser: running,
          cloudStarted: useGoLogin,
          proxyLeaseId: null,
        });
        connectedBrowser = null;
      },
    });
    const page = started.prepared;

    const isGmb = input.campaignKind === "gmb";
    const businessName = input.gmbBusinessName?.trim() ?? "";
    if (isGmb && !businessName) {
      throw new Error("gmbBusinessName is required for GMB preflight");
    }

    const google = googleTargetFor(identity.country, identity.locale);
    for (const query of input.queries) {
      const result = isGmb
        ? await checkGmbQueryOnPage(page, query, businessName, google, input.gmbPlaceId)
        : await checkQueryOnPage(
            page,
            query,
            input.targetDomain,
            input.maxSerpPages,
            persona,
            traits,
            google,
          );
      results.push(result);
      if (input.jobId) {
        void updatePreflightJobProgress(input.jobId, results.length);
      }

      if (result.status === "blocked") {
        await registerGoogleBlock(identity.id, undefined);
        break;
      }

      if (!isDryRun() && input.queries.indexOf(query) < input.queries.length - 1) {
        await sleep(randomBetween(1500, 3500));
      }
    }
  } finally {
    cleanupRefs.connectedBrowser = connectedBrowser;
    cleanupRefs.runningBrowser = runningBrowser;
    cleanupRefs.cloudStarted = cloudStarted;
    cleanupRefs.proxyLeaseId = proxyLeaseId;
    await cleanupBrowserSession(cleanupRefs);
    clearSessionCleanup();
  }

  return results;
}
