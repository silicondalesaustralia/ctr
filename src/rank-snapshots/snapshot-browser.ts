import type { Identity } from "@prisma/client";
import type { Page } from "../browser/pw.js";
import { verifyBrowserEgressGeo, type EgressGeo } from "../browser/egress-geo.js";
import { getEnv, isDryRun } from "../config/env.js";
import type { GeoPoint, RunningBrowser } from "../providers/browser/BrowserProfileProvider.js";
import { createBrowserProvider } from "../providers/browser/index.js";
import { assertEgressPrefixClean } from "../providers/proxy/ip-reputation.js";
import { createProxyProvider } from "../providers/proxy/index.js";
import { egressCityFor } from "../sessions/clean-lease.js";
import {
  cleanupBrowserSession,
  clearSessionCleanup,
  registerSessionCleanup,
  type BrowserCleanupRefs,
} from "../sessions/session-cleanup.js";
import { startBrowserWithLeaseRetry } from "../sessions/start-browser-with-lease.js";

export interface SnapshotBrowser {
  page: Page;
  egress: EgressGeo | undefined;
}

/** Launch the identity's Camoufox on a lease verified for its country, run fn, then always tear down. */
export async function withSnapshotBrowser<T>(
  identity: Identity,
  geoPoint: GeoPoint | undefined,
  fn: (browser: SnapshotBrowser) => Promise<T>,
): Promise<T> {
  const env = getEnv();
  const profileId = identity.externalProfileId;
  if (!profileId) throw new Error(`Identity ${identity.externalId} has no profile ID`);

  const browserProvider = createBrowserProvider();
  const proxyProvider = createProxyProvider();
  const refs: BrowserCleanupRefs = {
    connectedBrowser: null,
    runningBrowser: null,
    profileId,
    cloudStarted: false,
    useGoLogin: false,
    browserProvider,
    proxyLeaseId: null,
    proxyProvider,
  };
  registerSessionCleanup(() => cleanupBrowserSession(refs));

  try {
    const started = await startBrowserWithLeaseRetry({
      proxyProvider,
      browserProvider,
      profileId,
      allocation: {
        country: identity.country,
        region: identity.region,
        city: identity.city,
        sessionKey: `snapshot-${identity.externalId}-${Date.now()}`,
        deviceClass: identity.deviceClass,
      },
      timezone: identity.timezone,
      locale: identity.locale,
      options: { geoPoint },
      onLease: (leaseId) => {
        refs.proxyLeaseId = leaseId;
      },
      onRunning: (running) => {
        refs.runningBrowser = running;
      },
      prepare: async (running: RunningBrowser): Promise<SnapshotBrowser> => {
        if (!running.context) throw new Error("Rank snapshots require a Camoufox browser context");
        const page = running.context.pages()[0] ?? (await running.context.newPage());
        if (isDryRun() || env.PROXY_PROVIDER === "mock") return { page, egress: undefined };
        const expectedCity = egressCityFor(identity.city, identity.deviceClass);
        const egress = await verifyBrowserEgressGeo(page, identity.country, expectedCity);
        await assertEgressPrefixClean(egress.ip, identity.deviceClass === "mobile");
        return { page, egress };
      },
      discard: async (running) => {
        await cleanupBrowserSession({ ...refs, runningBrowser: running, proxyLeaseId: null });
      },
    });
    return await fn(started.prepared);
  } finally {
    await cleanupBrowserSession(refs);
    clearSessionCleanup();
  }
}
