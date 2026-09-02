#!/usr/bin/env node
/** Dump local-pack candidates for a GMB query (Orbita + Decodo). */
import { chromium } from "playwright";
import { getEnv } from "../src/config/env.js";
import { createGoLoginProvider } from "../src/providers/browser/GoLoginProvider.js";
import { createProxyProvider } from "../src/providers/proxy/index.js";
import {
  collectLocalPackCandidates,
  findGmbInLocalPack,
  openMorePlaces,
} from "../src/browser/local-pack.js";
import { openGoogle, typeAndSubmitQuery } from "../src/browser/google-search.js";
import { FAST_DRY_RUN_PERSONA } from "../src/behaviour/personas.js";
import { generateSessionTraits } from "../src/behaviour/session-traits.js";

const profileId = process.argv[2] ?? "6a8e86efd430d862c7d13847";
const query = process.argv[3] ?? "plumber Mount Barker";
const businessName = process.argv[4] ?? "McLennan Plumbing & Gas";
const placeId = process.argv[5] ?? "ChIJZSKJ9p5Ex0URfbxQ9JRv2H4";

async function main(): Promise<void> {
  const env = getEnv();
  const proxyProvider = createProxyProvider();
  const browserProvider = createGoLoginProvider();
  const lease = await proxyProvider.allocate({
    country: "AU",
    region: "SA",
    city: "Adelaide",
    sessionKey: `gmbprobe${Date.now().toString(36).slice(-6)}`,
    deviceClass: "mobile",
  });

  const running = await browserProvider.startProfile(profileId, {
    host: lease.host,
    port: lease.port,
    username: lease.username,
    password: lease.password,
    country: lease.country,
    region: lease.region,
    city: lease.city,
    sessionKey: lease.sessionKey,
  });

  const browser = await chromium.connectOverCDP(running.wsEndpoint!);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());

  const traits = generateSessionTraits(FAST_DRY_RUN_PERSONA, "probe", "probe");
  await openGoogle(page);
  await typeAndSubmitQuery(page, query, FAST_DRY_RUN_PERSONA, traits);

  const serpCandidates = await collectLocalPackCandidates(page);
  console.log(
    JSON.stringify({
      step: "serp",
      url: page.url(),
      candidates: serpCandidates,
    }),
  );

  const opened = await openMorePlaces(page, query);
  const afterCandidates = await collectLocalPackCandidates(page);
  console.log(
    JSON.stringify({
      step: "after_more_places",
      opened,
      url: page.url(),
      candidates: afterCandidates,
    }),
  );

  const found = await findGmbInLocalPack(page, {
    businessName,
    placeId,
    query,
  });
  console.log(JSON.stringify({ step: "find", found }));

  await browser.close();
  await browserProvider.stopProfile(profileId);
  await proxyProvider.release(lease.leaseId);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
