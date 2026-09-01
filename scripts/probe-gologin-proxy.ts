#!/usr/bin/env node
/**
 * Probe GoLogin cloud egress strategies. Prints only geo results (no secrets).
 * Usage: npx tsx scripts/probe-gologin-proxy.ts [profileId] [mode]
 * mode: patch | add_proxies | gologin_au | headed
 */
import { chromium } from "playwright";
import { verifyBrowserEgressGeo } from "../src/browser/egress-geo.js";
import { getEnv } from "../src/config/env.js";
import {
  acquireGoLoginSlot,
  releaseGoLoginSlot,
} from "../src/providers/browser/gologin-slot-lock.js";
import {
  type GoLoginStartResponse,
  resolveConnectUrl,
} from "../src/providers/browser/gologin-utils.js";
import { createProxyProvider } from "../src/providers/proxy/index.js";
import { sleep } from "../src/utils/helpers.js";

const baseUrl = "https://api.gologin.com";

async function glRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GoLogin ${response.status}: ${text.slice(0, 300)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function main(): Promise<void> {
  const profileId = process.argv[2] ?? "6a8e86efd430d862c7d13847";
  const mode = process.argv[3] ?? "add_proxies";
  const env = getEnv();
  if (!env.GOLOGIN_API_TOKEN) throw new Error("GOLOGIN_API_TOKEN missing");
  const token = env.GOLOGIN_API_TOKEN;

  const proxyProvider = createProxyProvider();
  const lease = await proxyProvider.allocate({
    country: "AU",
    region: "SA",
    city: "Adelaide",
    sessionKey: `probe${Date.now().toString(36).slice(-8)}`,
    deviceClass: "mobile",
  });

  const slot = await acquireGoLoginSlot(profileId);
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;

  try {
    console.error(`mode=${mode} profile=${profileId}`);

    if (mode === "gologin_au") {
      await glRequest(token, "/users-proxies/mobile-proxy", {
        method: "POST",
        body: JSON.stringify({
          countryCode: "au",
          city: "Adelaide",
          profileIdToLink: profileId,
          isMobile: true,
          customName: `gl-au-${Date.now().toString(36).slice(-6)}`,
        }),
      });
      console.error("linked GoLogin AU mobile proxy");
    } else if (mode === "add_proxies") {
      const created = await glRequest<Array<{ id?: string; _id?: string }>>(
        token,
        "/proxy/add_proxies",
        {
          method: "POST",
          body: JSON.stringify({
            proxies: [
              {
                mode: "http",
                host: lease.host,
                port: Number(lease.port),
                username: lease.username,
                password: lease.password,
                customName: `decodo-${lease.sessionKey}`.slice(0, 60),
              },
            ],
          }),
        },
      );
      const proxyId = created[0]?.id ?? created[0]?._id;
      if (!proxyId) throw new Error("add_proxies returned no id");
      await glRequest(token, `/browser/proxy/many/v2`, {
        method: "PATCH",
        body: JSON.stringify({
          proxies: [{ profileId, proxy: { id: proxyId, mode: "http" } }],
        }),
      });
      console.error(`linked proxy entity ${proxyId.slice(0, 8)}…`);
    } else {
      await glRequest(token, `/browser/proxy/many/v2`, {
        method: "PATCH",
        body: JSON.stringify({
          proxies: [
            {
              profileId,
              proxy: {
                mode: "http",
                host: lease.host,
                port: Number(lease.port),
                username: lease.username,
                password: lease.password,
              },
            },
          ],
        }),
      });
      console.error("patched inline credentials");
    }

    const verified = await glRequest<{
      proxy?: { mode?: string; host?: string; username?: string; id?: string };
    }>(token, `/browser/${profileId}`);
    console.error(
      `readback mode=${verified.proxy?.mode} host=${verified.proxy?.host ?? "n/a"} hasUser=${Boolean(verified.proxy?.username)} id=${verified.proxy?.id?.slice(0, 8) ?? "n/a"}`,
    );

    try {
      await glRequest(token, `/browser/${profileId}/web`, { method: "DELETE" });
    } catch {
      /* already stopped */
    }

    const headed = mode === "headed";
    const start = await glRequest<GoLoginStartResponse>(
      token,
      `/browser/${profileId}/web`,
      {
        method: "POST",
        body: JSON.stringify({ isHeadless: !headed }),
      },
    );

    await sleep(15_000);
    const ws = resolveConnectUrl(start, profileId, token);
    browser = await chromium.connectOverCDP(ws);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    const egress = await verifyBrowserEgressGeo(page, "AU");
    console.log(JSON.stringify({ ok: true, mode, egress }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL mode=${mode}: ${message}`);
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
    try {
      await glRequest(token, `/browser/${profileId}/web`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    await releaseGoLoginSlot(slot);
    await proxyProvider.release(lease.leaseId);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
