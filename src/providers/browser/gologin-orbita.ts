import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GoLogin } from "gologin";
import { isGoLoginHeadless } from "../../config/env.js";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";
import type { RunningBrowser } from "./BrowserProfileProvider.js";
import { clearProfileProxy } from "./gologin-proxy.js";
import { killOrphanBrowserProcesses, logWorkerMemory } from "./orphan-browsers.js";

type GlRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

const activeOrbita = new Map<string, InstanceType<typeof GoLogin>>();

function buildProxyServerUrl(proxy: ProxyConfig): string {
  return `http://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`;
}

/**
 * GoLogin API omits proxy passwords on profile download. Orbita 135+ then writes
 * Preferences as user@host (no password) → INVALID_AUTH, or ignores CLI userinfo
 * and browses direct (Railway AMS → NL). Patch Preferences with the real lease.
 */
async function injectProxyPreferences(
  profilePath: string,
  proxy: ProxyConfig,
): Promise<void> {
  const prefsPath = join(profilePath, "Default", "Preferences");
  const raw = await readFile(prefsPath, "utf8");
  const prefs = JSON.parse(raw) as {
    proxy?: Record<string, unknown>;
    gologin?: { proxy?: Record<string, unknown> };
  };
  const server = buildProxyServerUrl(proxy);
  prefs.proxy = { mode: "fixed_servers", server };
  prefs.gologin = {
    ...(prefs.gologin ?? {}),
    proxy: {
      ...(prefs.gologin?.proxy ?? {}),
      mode: "http",
      host: proxy.host,
      port: Number(proxy.port),
      username: proxy.username,
      password: proxy.password,
      server,
    },
  };
  await writeFile(prefsPath, JSON.stringify(prefs));
  console.error(
    `[gologin] Injected proxy prefs for ${proxy.host}:${proxy.port} user=${proxy.username.slice(0, 36)}…`,
  );
}

/**
 * Launch GoLogin Orbita on the worker with a residential proxy.
 * Requires scripts/patch-gologin.js (localhost DNS exclude + major version pin).
 */
export async function startOrbitaWithProxy(
  apiToken: string,
  request: GlRequest,
  profileId: string,
  proxy: ProxyConfig,
  timezoneId = "Australia/Adelaide",
): Promise<RunningBrowser> {
  // Avoid password-stripped profile proxy binding into Preferences on download.
  await clearProfileProxy(request, profileId);

  const existing = activeOrbita.get(profileId);
  if (existing) {
    await existing.stop().catch(() => undefined);
    activeOrbita.delete(profileId);
  }

  const proxyServer = buildProxyServerUrl(proxy);
  const extraParams = [
    `--proxy-server=${proxyServer}`,
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ];
  if (isGoLoginHeadless()) {
    extraParams.push("--headless=new");
  }

  const gl = new GoLogin({
    token: apiToken,
    profile_id: profileId,
    extra_params: extraParams,
    autoUpdateBrowser: false,
    skipOrbitaHashChecking: true,
    browserMajorVersion: 135,
    timezone: {
      timezone: timezoneId,
      country: proxy.country ?? "AU",
      city: proxy.city ?? "Adelaide",
      ip: "127.0.0.1",
    },
  });

  type GoLoginStartup = {
    createStartup: (...args: unknown[]) => Promise<string>;
  };
  const glWithStartup = gl as unknown as GoLoginStartup;
  const originalCreateStartup = glWithStartup.createStartup.bind(gl);
  glWithStartup.createStartup = async (...args: unknown[]) => {
    const profilePath = await originalCreateStartup(...args);
    await injectProxyPreferences(profilePath, proxy);
    return profilePath;
  };

  logWorkerMemory(`before-orbita ${profileId}`);
  console.error(
    `[gologin] Starting local Orbita for ${profileId} (prefs+CLI proxy, host=${proxy.host}:${proxy.port})…`,
  );
  const started = await gl.start();
  if (!started.wsUrl) {
    await gl.stop().catch(() => undefined);
    killOrphanBrowserProcesses("orbita-start-no-ws");
    throw new Error(`Orbita start returned no wsUrl for ${profileId}`);
  }

  activeOrbita.set(profileId, gl);
  logWorkerMemory(`after-orbita ${profileId}`);
  console.error(
    `[gologin] Orbita ready for ${profileId} (${isGoLoginHeadless() ? "headless" : "headful"}, proxy via worker)`,
  );

  return {
    profileId,
    wsEndpoint: started.wsUrl,
    cdpUrl: started.wsUrl,
    runtime: "orbita",
  };
}

export async function stopOrbita(profileId: string): Promise<void> {
  const gl = activeOrbita.get(profileId);
  if (!gl) return;
  activeOrbita.delete(profileId);
  console.error(`[gologin] Stopping local Orbita for ${profileId}…`);
  await gl.stop().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[gologin] Orbita stop failed: ${message}`);
  });
  killOrphanBrowserProcesses(`after-stop ${profileId}`);
  logWorkerMemory(`after-stop ${profileId}`);
}
