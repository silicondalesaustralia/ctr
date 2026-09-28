#!/usr/bin/env node
/**
 * Control test: Camoufox (Firefox-based) instead of Orbita, on this machine's own
 * internet (no proxy). Mirrors the warmup flow: AU site browse, Google homepage,
 * typed search with persona timings. Uses Camoufox's bundled playwright-core
 * (Patchright 1.51 cannot drive this Camoufox build), so helpers are inlined.
 *
 * Usage: npx tsx scripts/camoufox-home-control.ts --confirm [--proxy] [--query="..."]
 *   --proxy  route through a Premium Ports Melbourne lease instead of this machine's IP
 *   --hold=N keep the window open N seconds after the result (default 5)
 *   --click  after a clean search, click an organic result and browse that site
 */
import { mkdir } from "node:fs/promises";
import { Camoufox } from "camoufox-js";
import type { Page } from "playwright-core";
import { getPersonaById } from "../src/behaviour/personas.js";
import { generateSessionTraits } from "../src/behaviour/session-traits.js";
import { effectivePauseMs, effectiveTypingDelayMs } from "../src/behaviour/behaviour-config.js";
import { createProxyProvider } from "../src/providers/proxy/index.js";
import { randomBetween, sleep } from "../src/utils/helpers.js";
import { visitResultAndBrowse } from "./camoufox-site-visit.js";

const AU_SITES = ["https://www.abc.net.au/", "https://www.bom.gov.au/"];

function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function blockedReason(page: Page): Promise<string | null> {
  if (/\/sorry\//i.test(page.url())) return "google_sorry_page";
  const text = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  return /unusual traffic/i.test(text) ? "unusual traffic" : null;
}

async function logEgress(page: Page): Promise<void> {
  const response = await page.goto("http://ip-api.com/json/?fields=countryCode,regionName,city,query", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (!response?.ok()) throw new Error(`Egress lookup failed: HTTP ${response?.status() ?? "none"}`);
  const geo = JSON.parse(await page.locator("body").innerText()) as Record<string, string>;
  console.log(`Egress: ${geo.query} ${geo.city}, ${geo.regionName} ${geo.countryCode}`);
}

async function browseSites(page: Page): Promise<void> {
  for (const url of AU_SITES) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await sleep(randomBetween(2_500, 6_000));
      await page.mouse.wheel(0, randomBetween(200, 900));
      await sleep(randomBetween(1_500, 4_000));
      console.log(`Browsed ${url}`);
    } catch (error) {
      console.error(`Browse failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing without --confirm (this runs one real Google search on your IP)");
  }
  const query = flag("query") ?? "things to do melbourne";
  const persona = getPersonaById("normal_researcher");
  if (!persona) throw new Error("Persona normal_researcher not found in config/personas.yml");
  const name = `camoufox_control_${Date.now().toString(36)}`;
  const traits = generateSessionTraits(persona, name, name);

  const proxyProvider = process.argv.includes("--proxy") ? createProxyProvider() : null;
  const lease = proxyProvider
    ? await proxyProvider.allocate({ country: "AU", region: "VIC", city: "Melbourne", sessionKey: name, deviceClass: "desktop" })
    : null;
  if (lease) console.log(`Proxy: ${lease.host}:${lease.port} user=${lease.username.slice(0, 48)}…`);

  const browser = await Camoufox({
    headless: false,
    os: "windows",
    locale: "en-AU",
    geoip: true,
    humanize: true,
    ...(lease && {
      proxy: { server: `http://${lease.host}:${lease.port}`, username: lease.username, password: lease.password },
    }),
  }).catch(async (error: unknown) => {
    if (lease && proxyProvider) await proxyProvider.release(lease.leaseId);
    throw error;
  });
  try {
    const page = await browser.newPage();
    await page.bringToFront();
    await logEgress(page);
    await browseSites(page);

    await page.goto("https://www.google.com.au/?hl=en-AU&gl=au", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const onLoad = await blockedReason(page);
    console.log(`Google homepage: ${onLoad ? `BLOCKED (${onLoad})` : "ok"}`);

    let result = onLoad ? `BLOCKED on homepage (${onLoad})` : "";
    if (!onLoad) {
      const box = page.locator('textarea[name="q"], input[name="q"]').first();
      await box.waitFor({ state: "visible", timeout: 15_000 });
      await box.click();
      const pre = effectivePauseMs(persona.preTypePauseMs, traits);
      await sleep(randomBetween(pre[0], pre[1]));
      const typing = effectiveTypingDelayMs(persona, traits);
      await page.keyboard.type(query, { delay: randomBetween(typing[0], typing[1]) });
      const post = effectivePauseMs(persona.postTypePauseMs, traits);
      await sleep(randomBetween(post[0], post[1]));
      await page.keyboard.press("Enter");
      await page.waitForURL(/google\.[^/]+\/(search|sorry)/i, { timeout: 30_000 }).catch(() => undefined);
      await sleep(randomBetween(1_500, 2_500));
      const onSearch = await blockedReason(page);
      result = onSearch ? `BLOCKED on search (${onSearch})` : "PASSED";
      if (!onSearch && process.argv.includes("--click")) {
        try {
          const visit = await visitResultAndBrowse(page);
          console.log(`Site visit: ${visit.pagesVisited.length} page(s)`);
        } catch (error) {
          console.error(`Site visit failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
        }
      }
    }

    await mkdir("tmp", { recursive: true });
    const shot = `tmp/${name}.png`;
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`\nRESULT: ${result}\nQuery: "${query}"\nURL: ${page.url().slice(0, 160)}\nScreenshot: ${shot}`);
    await sleep(Number(flag("hold") ?? 5) * 1_000);
  } finally {
    await browser.close().catch((error: unknown) => {
      console.error(`Camoufox close failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (lease && proxyProvider) await proxyProvider.release(lease.leaseId);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
