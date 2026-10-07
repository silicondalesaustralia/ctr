#!/usr/bin/env node
/**
 * Measure a proxy provider's pool without launching a browser: draws N sticky leases per
 * target and classifies each IP as mobile / possible_mobile / fixed / datacenter.
 *
 * Usage: npx tsx scripts/probe-mobile-pool.ts --provider=soax [--country=AU] [--count=25]
 *          [--targets=all,adelaide,sydney] [--asn=1221] [--isp=telstra_internet]
 * A target of "all" (or the country code) means country-wide; anything else is a city.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { createNamedProxyProvider, type ProxyProviderName } from "../src/providers/proxy/index.js";
import { sampleLease, type LeaseSample } from "./mobile-probe-lookup.js";

const CONCURRENCY = 5;
const PROVIDERS: ProxyProviderName[] = ["oxylabs", "brightdata", "soax", "premiumports", "decodo"];

function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function tally(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(", ");
}

function report(label: string, country: string, samples: LeaseSample[], count: number): void {
  const mobile = samples.filter((s) => s.connection === "mobile").length;
  console.log(`\n=== ${label}: ${samples.length}/${count} ok`);
  console.log(`connection: ${tally(samples.map((s) => s.connection))}`);
  console.log(`VERDICT: ${mobile}/${samples.length} confirmed mobile — ${mobile * 2 > samples.length ? "PASS" : "FAIL"}`);
  console.log(`ip-api cellular flag: ${samples.filter((s) => s.ipApiMobile).length}/${samples.length}`);
  console.log(`in ${country}: ${samples.filter((s) => s.country === country).length}/${samples.length}`);
  console.log(`network: ${tally(samples.map((s) => `${s.asn ?? "?"} ${s.org.slice(0, 24)}`))}`);
  console.log(`ipinfo city: ${tally(samples.map((s) => s.ipinfoCity))}`);
  console.log(`ip-api city: ${tally(samples.map((s) => s.ipApiCity))}`);
  console.log(`unique IPs ${new Set(samples.map((s) => s.ip)).size}, sticky held ${samples.filter((s) => s.stable).length}`);
  console.log(`rdns: ${tally(samples.map((s) => s.rdns?.split(".").slice(-3).join(".") ?? "none"))}`);
}

interface NetworkFilter {
  asn?: number;
  isp?: string;
}

interface ProbeRun {
  name: ProxyProviderName;
  country: string;
  count: number;
  filter: NetworkFilter;
  runId: string;
}

async function probeTarget(run: ProbeRun, target: string) {
  const { name, country, count, filter, runId } = run;
  const provider = createNamedProxyProvider(name);
  const city = target === "all" || target === country.toLowerCase() ? undefined : target;
  const samples: LeaseSample[] = [];
  for (let start = 0; start < count; start += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, count - start) }, async (_, i) => {
      const sessionKey = `${runId}${country}${target}${start + i}`;
      const lease = await provider.allocate({ country, city, ...filter, sessionKey });
      try {
        return await sampleLease(lease, target);
      } finally {
        await provider.release(lease.leaseId);
      }
    });
    for (const result of await Promise.allSettled(batch)) {
      if (result.status === "fulfilled") samples.push(result.value);
      else console.error(`[${target}] lease failed: ${String(result.reason).slice(0, 140)}`);
    }
  }
  report(`${country} ${target}`, country, samples, count);
  return samples;
}

async function main(): Promise<void> {
  const name = flag("provider") as ProxyProviderName | undefined;
  if (!name || !PROVIDERS.includes(name)) throw new Error(`--provider must be one of ${PROVIDERS.join(", ")}`);
  const count = Number(flag("count") ?? 25);
  const asnFlag = flag("asn");
  const filter: NetworkFilter = { asn: asnFlag ? Number(asnFlag) : undefined, isp: flag("isp") };
  const country = (flag("country") ?? "AU").toUpperCase();
  const targets = (flag("targets") ?? "all").split(",").map((t) => t.trim().toLowerCase());
  const run: ProbeRun = { name, country, count, filter, runId: Date.now().toString(36) };
  const all: LeaseSample[] = [];
  for (const target of targets) all.push(...(await probeTarget(run, target)));
  await mkdir("tmp", { recursive: true });
  const suffix = `-${country.toLowerCase()}${filter.asn ? `-asn${filter.asn}` : ""}${filter.isp ? `-${filter.isp}` : ""}`;
  const out = `tmp/probe-${name}${suffix}-${run.runId}.json`;
  await writeFile(out, JSON.stringify(all, null, 2));
  console.log(`\nRaw samples: ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
