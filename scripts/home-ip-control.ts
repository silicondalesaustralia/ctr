#!/usr/bin/env node
/**
 * Control test: same Orbita + Patchright + search flow as warmups, but on this
 * machine's own internet (no proxy). Tells us whether Google blocks the IPs or
 * the browser stack.
 *
 * Usage: npx tsx scripts/home-ip-control.ts --confirm [--query="..."] [--keep-profile]
 */
import { mkdir } from "node:fs/promises";
import { GoLogin } from "gologin";
import { chromium } from "../src/browser/pw.js";
import { getEnv } from "../src/config/env.js";
import { getPersonaById } from "../src/behaviour/personas.js";
import { generateSessionTraits } from "../src/behaviour/session-traits.js";
import { applyBrowserStealth } from "../src/browser/stealth.js";
import { verifyBrowserEgressGeo } from "../src/browser/egress-geo.js";
import { browseAuSitesBeforeGoogle } from "../src/browser/pre-google-browse.js";
import { checkBlocked, openGoogle, typeAndSubmitQuery } from "../src/browser/google-search.js";
import { createGoLoginProvider } from "../src/providers/browser/GoLoginProvider.js";
import { sleep } from "../src/utils/helpers.js";

const TIMEZONE = "Australia/Adelaide";

function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing without --confirm (this runs one real Google search on your IP)");
  }
  const query = flag("query") ?? "things to do melbourne";
  const keepProfile = process.argv.includes("--keep-profile");
  const token = getEnv().GOLOGIN_API_TOKEN;
  if (!token) throw new Error("GOLOGIN_API_TOKEN is required");

  const persona = getPersonaById("normal_researcher");
  if (!persona) throw new Error("Persona normal_researcher not found in config/personas.yml");

  const provider = createGoLoginProvider();
  const name = `home_control_${Date.now().toString(36)}`;
  const profile = await provider.createProfile({
    name,
    deviceClass: "desktop",
    osFamily: "windows",
    locale: "en-AU",
    timezone: TIMEZONE,
    region: "SA",
    city: "Adelaide",
  });
  console.log(`Created fresh GoLogin profile ${profile.profileId} (${name})`);

  const gl = new GoLogin({
    token,
    profile_id: profile.profileId,
    extra_params: [],
    autoUpdateBrowser: false,
    skipOrbitaHashChecking: true,
    browserMajorVersion: 135,
    timezone: { timezone: TIMEZONE, country: "AU", city: "Adelaide", ip: "127.0.0.1" },
  });

  try {
    const started = await gl.start();
    if (!started.wsUrl) throw new Error("Orbita start returned no wsUrl");
    const browser = await chromium.connectOverCDP(started.wsUrl, { timeout: 30_000 });
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await applyBrowserStealth(page);

    const egress = await verifyBrowserEgressGeo(page, "AU");
    console.log(`Egress: ${egress.ip} ${egress.city ?? "?"}, ${egress.region ?? "?"} (${egress.source})`);

    const sites = await browseAuSitesBeforeGoogle(page);
    console.log(`Pre-Google browse: ${sites.join(", ") || "none"}`);

    await openGoogle(page);
    const afterLoad = await checkBlocked(page);
    console.log(`Google homepage: ${afterLoad.blocked ? `BLOCKED (${afterLoad.reason})` : "ok"}`);

    let result = afterLoad.blocked ? `BLOCKED on homepage (${afterLoad.reason})` : "";
    if (!afterLoad.blocked) {
      const traits = generateSessionTraits(persona, name, name);
      await typeAndSubmitQuery(page, query, persona, traits);
      const afterSearch = await checkBlocked(page);
      result = afterSearch.blocked ? `BLOCKED on search (${afterSearch.reason})` : "PASSED";
    }

    await mkdir("tmp", { recursive: true });
    const shot = `tmp/${name}.png`;
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`\nRESULT: ${result}\nQuery: "${query}"\nURL: ${page.url()}\nScreenshot: ${shot}`);
    await sleep(5_000);
    await browser.close().catch(() => undefined);
  } finally {
    await gl.stop().catch((error: unknown) => {
      console.error(`Orbita stop failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (!keepProfile) {
      await provider.deleteProfile(profile.profileId).catch((error: unknown) => {
        console.error(`Profile delete failed: ${error instanceof Error ? error.message : String(error)}`);
      });
      console.log(`Deleted profile ${profile.profileId}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
