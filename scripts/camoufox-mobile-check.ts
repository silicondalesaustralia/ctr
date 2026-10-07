#!/usr/bin/env node
/**
 * Camoufox through a sticky mobile proxy lease: typed Google search, block detection, screenshot.
 * --mode=mobile spoofs Firefox for Android (UA, touch, phone screen); --mode=desktop keeps the
 * normal Windows fingerprint (a laptop on a phone hotspot). Geo / timezone follow the lease IP.
 *
 * Usage: npx tsx scripts/camoufox-mobile-check.ts --confirm [--mode=mobile] [--provider=soax]
 *          [--countries=AU,GB,US] [--runs=2] [--no-proxy]
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { Camoufox } from "camoufox-js";
import { createNamedProxyProvider, type ProxyProviderName } from "../src/providers/proxy/index.js";
import { firefoxAndroidOverrides } from "../src/providers/browser/camoufox-mobile.js";
import { googleSearch } from "./mobile-google-search.js";

const MARKETS: Record<string, { domain: string; locale: string }> = {
  AU: { domain: "www.google.com.au", locale: "en-AU" },
  GB: { domain: "www.google.co.uk", locale: "en-GB" },
  US: { domain: "www.google.com", locale: "en-US" },
  NZ: { domain: "www.google.co.nz", locale: "en-NZ" },
  CA: { domain: "www.google.ca", locale: "en-CA" },
  IE: { domain: "www.google.ie", locale: "en-IE" },
};
const QUERY = "pizza near me";

function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function runOne(country: string, run: number, mobile: boolean, providerName: ProxyProviderName | null) {
  const market = MARKETS[country];
  if (!market) throw new Error(`No market config for ${country}`);
  const provider = providerName ? createNamedProxyProvider(providerName) : null;
  const tag = `${mobile ? "m" : "d"}${country.toLowerCase()}${run}${Date.now().toString(36)}`;
  const lease = provider ? await provider.allocate({ country, sessionKey: `cmc${tag}`, deviceClass: "mobile" }) : null;
  const overrides = mobile ? firefoxAndroidOverrides() : null;
  const browser = await Camoufox({
    headless: false,
    os: mobile ? "linux" : "windows",
    locale: market.locale,
    geoip: true,
    humanize: true,
    // Never ask macOS for real location; Camoufox supplies the lease's geoip position.
    firefox_user_prefs: { "geo.provider.use_corelocation": false, ...overrides?.firefox_user_prefs },
    ...(overrides && {
      config: overrides.config,
      window: overrides.window,
      i_know_what_im_doing: true,
    }),
    ...(lease && {
      proxy: { server: `http://${lease.host}:${lease.port}`, username: lease.username, password: lease.password },
    }),
  });
  try {
    const page = await browser.newPage();
    const ua = await page.evaluate(() => navigator.userAgent);
    const outcome = await googleSearch(page, market.domain, market.locale, QUERY);
    await mkdir("tmp/camoufox-mobile", { recursive: true });
    const shot = `tmp/camoufox-mobile/${tag}.png`;
    await page.screenshot({ path: shot });
    const device = /Android/.test(ua) ? "android" : "desktop";
    return `${country} #${run} ${mobile ? "mobile " : "desktop"} ${outcome.result.padEnd(28)} ua=${device} shot=${shot}`;
  } finally {
    await browser.close();
    if (lease && provider) await provider.release(lease.leaseId);
  }
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) throw new Error("Refusing without --confirm (runs real Google searches)");
  const providerName = process.argv.includes("--no-proxy") ? null : ((flag("provider") ?? "soax") as ProxyProviderName);
  const mobile = (flag("mode") ?? "mobile") === "mobile";
  const countries = (flag("countries") ?? "AU,GB,US").split(",").map((c) => c.trim().toUpperCase());
  const runs = Number(flag("runs") ?? 2);
  const lines: string[] = [];
  for (const country of countries) {
    for (let run = 1; run <= runs; run += 1) {
      const line = await runOne(country, run, mobile, providerName).catch(
        (error: unknown) => `${country} #${run} ERROR ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
      console.log(line);
      lines.push(line);
    }
  }
  await mkdir("tmp/camoufox-mobile", { recursive: true });
  await writeFile(`tmp/camoufox-mobile/summary-${Date.now().toString(36)}.txt`, `${lines.join("\n")}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
