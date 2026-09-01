import { GoLogin } from "gologin";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";
import type { RunningBrowser } from "./BrowserProfileProvider.js";
import { applyDecodoProxyToProfile } from "./gologin-proxy.js";

type GlRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

const activeOrbita = new Map<string, InstanceType<typeof GoLogin>>();

/**
 * Launch GoLogin Orbita on the worker with Decodo attached to the profile.
 * Cloud Orbita cannot reach Decodo; local Orbita can (and keeps anti-detect fingerprints).
 */
export async function startOrbitaWithProxy(
  apiToken: string,
  request: GlRequest,
  profileId: string,
  proxy: ProxyConfig,
): Promise<RunningBrowser> {
  await applyDecodoProxyToProfile(request, profileId, proxy);

  const existing = activeOrbita.get(profileId);
  if (existing) {
    await existing.stop().catch(() => undefined);
    activeOrbita.delete(profileId);
  }

  const gl = new GoLogin({
    token: apiToken,
    profile_id: profileId,
    extra_params: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
    autoUpdateBrowser: true,
    skipOrbitaHashChecking: true,
  });

  console.error(`[gologin] Starting local Orbita for ${profileId}…`);
  const started = await gl.start();
  if (!started.wsUrl) {
    await gl.stop().catch(() => undefined);
    throw new Error(`Orbita start returned no wsUrl for ${profileId}`);
  }

  activeOrbita.set(profileId, gl);
  console.error(`[gologin] Orbita ready for ${profileId} (Decodo via worker)`);

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
}
