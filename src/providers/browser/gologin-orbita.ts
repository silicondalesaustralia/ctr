import { GoLogin } from "gologin";
import { isGoLoginHeadless } from "../../config/env.js";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";
import type { RunningBrowser } from "./BrowserProfileProvider.js";
import { applyDecodoProxyToProfile } from "./gologin-proxy.js";
import { killOrphanBrowserProcesses, logWorkerMemory } from "./orphan-browsers.js";

type GlRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

const activeOrbita = new Map<string, InstanceType<typeof GoLogin>>();

/**
 * Launch GoLogin Orbita on the worker with Decodo.
 * Requires scripts/patch-gologin.js (localhost DNS exclude + major version pin).
 */
export async function startOrbitaWithProxy(
  apiToken: string,
  request: GlRequest,
  profileId: string,
  proxy: ProxyConfig,
  timezoneId = "Australia/Adelaide",
): Promise<RunningBrowser> {
  await applyDecodoProxyToProfile(request, profileId, proxy);

  const existing = activeOrbita.get(profileId);
  if (existing) {
    await existing.stop().catch(() => undefined);
    activeOrbita.delete(profileId);
  }

  const proxyServer = `http://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`;

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
    // true re-downloads Orbita on the worker and OOMs typical Railway plans.
    autoUpdateBrowser: false,
    skipOrbitaHashChecking: true,
    // >=135 writes encoded proxy auth into preferences (Chrome/120 profiles otherwise skip auth).
    browserMajorVersion: 135,
    timezone: {
      timezone: timezoneId,
      country: proxy.country ?? "AU",
      city: proxy.city ?? "Adelaide",
      ip: "127.0.0.1",
    },
  });

  logWorkerMemory(`before-orbita ${profileId}`);
  console.error(`[gologin] Starting local Orbita for ${profileId}…`);
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
