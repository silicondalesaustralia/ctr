import { chromium, type Page } from "playwright";
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
import { getEnv, isDryRun } from "../config/env.js";
import { prisma } from "../db/client.js";
import { createBrowserProvider, getMockBrowserProvider } from "../providers/browser/index.js";
import { isValidGoLoginProfileId } from "../providers/browser/gologin-utils.js";
import { createProxyProvider } from "../providers/proxy/index.js";
import {
  cleanupBrowserSession,
  clearSessionCleanup,
  registerSessionCleanup,
  type BrowserCleanupRefs,
} from "../sessions/session-cleanup.js";
import { hashValue, randomBetween, sleep } from "../utils/helpers.js";
import type { PreflightQueryResult } from "./preflight-types.js";

function globalPosition(serpPage: number, position: number): number {
  return (serpPage - 1) * 10 + position;
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

export async function pickPreflightIdentity(
  region: string,
  identityExternalId?: string,
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

  function filterPool(identities: Identity[]): Identity[] {
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

  const identities = filterPool(await prisma.identity.findMany({ where: { active: true } }));
  if (identities.length === 0) {
    throw new Error("No active identities available for Google preflight.");
  }

  const focusRegion = region === "ALL" ? null : region;
  const regional = focusRegion
    ? identities.filter((identity) => identity.region === focusRegion)
    : identities;
  const pool = regional.length > 0 ? regional : identities;
  const desktop = pool.filter((identity) => identity.deviceClass === "desktop");
  const pick = desktop[0] ?? pool[0] ?? identities[0];
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
        globalPosition: globalPosition(result.serpPage, result.position),
        status: "found",
      };
    }

    await openGoogle(page);
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

    const { result, pagesSearched } = await findTargetInSerp(page, targetDomain, maxSerpPages);
    if (!result) {
      return {
        query,
        found: false,
        serpPage: pagesSearched,
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
      globalPosition: globalPosition(result.serpPage, result.position),
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
      status: "error",
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
}): Promise<PreflightQueryResult[]> {
  const env = getEnv();
  const identity = await pickPreflightIdentity(input.region, input.identityExternalId);
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

    const proxyLease = await proxyProvider.allocate({
      country: "AU",
      region: identity.region,
      city: identity.city,
      sessionKey: `preflight-${hashValue(input.targetUrl)}`,
      deviceClass: identity.deviceClass,
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

    for (const query of input.queries) {
      const result = await checkQueryOnPage(
        page,
        query,
        input.targetDomain,
        input.maxSerpPages,
        persona,
        traits,
      );
      results.push(result);

      if (result.status === "blocked") {
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
