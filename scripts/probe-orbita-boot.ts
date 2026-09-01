#!/usr/bin/env node
/** Minimal Orbita+Decodo boot probe — no campaign session. */
import { GoLogin } from "gologin";
import { getEnv } from "../src/config/env.js";
import { createProxyProvider } from "../src/providers/proxy/index.js";
import { applyDecodoProxyToProfile } from "../src/providers/browser/gologin-proxy.js";

const profileId = process.argv[2] ?? "6a8e86efd430d862c7d13847";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getEnv().GOLOGIN_API_TOKEN!;
  const response = await fetch(`https://api.gologin.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function main(): Promise<void> {
  const env = getEnv();
  const proxyProvider = createProxyProvider();
  const lease = await proxyProvider.allocate({
    country: "AU",
    region: "SA",
    city: "Adelaide",
    sessionKey: `boot${Date.now().toString(36).slice(-6)}`,
    deviceClass: "mobile",
  });

  await applyDecodoProxyToProfile(
    (path, init) => request(path, init),
    profileId,
    {
      host: lease.host,
      port: lease.port,
      username: lease.username,
      password: lease.password,
      country: "AU",
      city: "Adelaide",
      sessionKey: lease.sessionKey,
    },
  );

  const proxyServer = `http://${encodeURIComponent(lease.username)}:${encodeURIComponent(lease.password)}@${lease.host}:${lease.port}`;
  const gl = new GoLogin({
    token: env.GOLOGIN_API_TOKEN!,
    profile_id: profileId,
    extra_params: [
      `--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE ${lease.host}, EXCLUDE api.gologin.com, EXCLUDE 127.0.0.1, EXCLUDE localhost`,
      `--proxy-server=${proxyServer}`,
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
    autoUpdateBrowser: true,
    skipOrbitaHashChecking: true,
    browserMajorVersion: 135,
    timezone: {
      timezone: "Australia/Adelaide",
      country: "AU",
      city: "Adelaide",
      ip: "127.0.0.1",
    },
  });

  console.error("starting…");
  try {
    const started = await gl.start();
    console.error("wsUrl", started.wsUrl);
    const { chromium } = await import("playwright");
    const browser = await chromium.connectOverCDP(started.wsUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    const ip = await page.evaluate(async () => {
      const res = await fetch("https://ipinfo.io/json");
      if (!res.ok) throw new Error(`ipinfo ${res.status}`);
      return res.json();
    });
    console.log(JSON.stringify({ ok: true, ip }));
    await browser.close();
  } finally {
    await gl.stop().catch(() => undefined);
    await proxyProvider.release(lease.leaseId);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
