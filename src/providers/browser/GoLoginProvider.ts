import { ProfileProvider } from "@prisma/client";
import { getEnv, isGoLoginHeadless } from "../../config/env.js";
import type {
  BrowserProfile,
  BrowserProfileProvider,
  CreateProfileInput,
  RunningBrowser,
} from "./BrowserProfileProvider.js";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";
import { sleep } from "../../utils/helpers.js";
import {
  type GoLoginStartResponse,
  resolveConnectUrl,
} from "./gologin-utils.js";
import {
  acquireGoLoginSlot,
  releaseGoLoginSlot,
} from "./gologin-slot-lock.js";
import {
  startLocalChromiumWithProxy,
  stopLocalChromium,
} from "./gologin-local.js";
import { startOrbitaWithProxy, stopOrbita } from "./gologin-orbita.js";
import { applyDecodoProxyToProfile } from "./gologin-proxy.js";
import { findRegionConfigByCity } from "../../identities/regions.js";

/** Must match `browserMajorVersion` in gologin-orbita.ts */
const ORBITA_CHROME_MAJOR = 135;

export class GoLoginProvider implements BrowserProfileProvider {
  private readonly apiToken: string;
  private readonly baseUrl = "https://api.gologin.com";

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const attempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          signal: AbortSignal.timeout(60_000),
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
          },
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`GoLogin API error ${response.status}: ${body}`);
        }

        const text = await response.text();
        if (!text) return {} as T;
        return JSON.parse(text) as T;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          message.includes("aborted") ||
          message.includes("timeout") ||
          message.includes("fetch failed");
        if (!retryable || attempt === attempts) break;
        console.error(`[gologin] ${path} attempt ${attempt} failed (${message}); retrying`);
        await sleep(2_000 * attempt);
      }
    }

    throw lastError;
  }

  async createProfile(input: CreateProfileInput): Promise<BrowserProfile> {
    const os =
      input.osFamily === "windows" ? "win" : input.osFamily === "mac" ? "mac" : "lin";
    const platform =
      input.osFamily === "windows"
        ? "Win32"
        : input.osFamily === "mac"
          ? "MacIntel"
          : "Linux x86_64";
    const chrome = `Chrome/${ORBITA_CHROME_MAJOR}.0.0.0`;
    const userAgent =
      input.deviceClass === "mobile"
        ? `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) ${chrome} Mobile Safari/537.36`
        : os === "mac"
          ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ${chrome} Safari/537.36`
          : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ${chrome} Safari/537.36`;

    const created = await this.request<{ id: string }>("/browser", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        browserType: "chrome",
        os,
        navigator: {
          language: input.locale,
          platform,
          userAgent,
          resolution: input.deviceClass === "mobile" ? "390x844" : "1366x768",
        },
        timezone: { id: input.timezone },
        proxy: { mode: "none" },
      }),
    });

    return {
      profileId: created.id,
      provider: ProfileProvider.gologin,
      name: input.name,
      deviceClass: input.deviceClass,
      osFamily: input.osFamily,
      locale: input.locale,
      timezone: input.timezone,
      region: input.region,
      city: input.city,
    };
  }

  async startProfile(profileId: string, proxy?: ProxyConfig): Promise<RunningBrowser> {
    const env = getEnv();
    const runtime = env.GOLOGIN_BROWSER_RUNTIME;

    if (runtime === "orbita") {
      if (!proxy || env.PROXY_PROVIDER === "mock") {
        throw new Error("GOLOGIN_BROWSER_RUNTIME=orbita requires a Decodo proxy lease");
      }
      const slotToken = await acquireGoLoginSlot(profileId);
      try {
        // Identity timezone is already stored. GET /browser/{id} was aborting
        // after 30s and the worker retried that forever.
        const timezoneId =
          proxy.timezone ??
          findRegionConfigByCity(proxy.city ?? "")?.timezone ??
          "Australia/Sydney";
        const running = await startOrbitaWithProxy(
          this.apiToken,
          (path, init) => this.request(path, init),
          profileId,
          proxy,
          timezoneId,
        );
        return { ...running, slotToken };
      } catch (error) {
        await releaseGoLoginSlot(slotToken);
        throw error;
      }
    }

    if (runtime === "chromium") {
      if (!proxy || env.PROXY_PROVIDER === "mock") {
        throw new Error("GOLOGIN_BROWSER_RUNTIME=chromium requires a Decodo proxy lease");
      }
      const profile = await this.request<{
        navigator?: { language?: string; userAgent?: string };
        timezone?: { id?: string };
      }>(`/browser/${profileId}`);
      const ua = profile.navigator?.userAgent?.toLowerCase() ?? "";
      const mobile = ua.includes("android") || ua.includes("iphone");
      const running = await startLocalChromiumWithProxy(profileId, proxy, {
        locale: profile.navigator?.language,
        timezone: profile.timezone?.id,
        deviceClass: mobile ? "mobile" : "desktop",
        userAgent: profile.navigator?.userAgent,
      });
      return { ...running, runtime: "chromium" };
    }

    return this.startCloudProfile(profileId, proxy);
  }

  private async startCloudProfile(
    profileId: string,
    proxy?: ProxyConfig,
  ): Promise<RunningBrowser> {
    const slotToken = await acquireGoLoginSlot(profileId);
    try {
      const env = getEnv();
      if (proxy && env.PROXY_PROVIDER !== "mock") {
        await this.updateProxy(profileId, proxy);
      } else {
        console.error(
          `[gologin] Skipping proxy update for ${profileId} (proxy=${Boolean(proxy)} provider=${env.PROXY_PROVIDER})`,
        );
      }

      console.error(`[gologin] Stopping any existing cloud session for ${profileId}...`);
      await this.stopCloudSession(profileId, { alreadyStoppedOk: true });

      console.error(`[gologin] Starting cloud profile ${profileId}...`);
      const started = await this.request<GoLoginStartResponse>(`/browser/${profileId}/web`, {
        method: "POST",
        body: JSON.stringify({ isHeadless: isGoLoginHeadless() }),
      });

      console.error("[gologin] Waiting for cloud container boot...");
      await sleep(15_000);

      const wsEndpoint = resolveConnectUrl(started, profileId, this.apiToken);
      console.error(
        `[gologin] Connect URL resolved (${wsEndpoint.startsWith("wss://") ? "wss" : "ws"})`,
      );

      return { profileId, wsEndpoint, cdpUrl: wsEndpoint, slotToken, runtime: "cloud" };
    } catch (error) {
      await releaseGoLoginSlot(slotToken);
      throw error;
    }
  }

  private async stopCloudSession(
    profileId: string,
    options?: { alreadyStoppedOk?: boolean },
  ): Promise<void> {
    console.error(`[gologin] Stopping cloud profile ${profileId}...`);
    try {
      await this.request(`/browser/${profileId}/web`, { method: "DELETE" });
      console.error(`[gologin] Cloud profile ${profileId} stopped`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options?.alreadyStoppedOk && message.includes("404")) {
        console.error(`[gologin] Cloud profile ${profileId} was not running`);
        return;
      }
      console.error(`[gologin] Failed to stop cloud profile ${profileId}: ${message}`);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  async stopProfile(profileId: string, running?: RunningBrowser): Promise<void> {
    try {
      const runtime = running?.runtime;
      if (runtime === "orbita") {
        await stopOrbita(profileId);
        return;
      }
      if (runtime === "chromium" || running?.browser || running?.context) {
        await stopLocalChromium(running);
        return;
      }
      await this.stopCloudSession(profileId, { alreadyStoppedOk: true });
    } finally {
      await releaseGoLoginSlot(running?.slotToken);
    }
  }

  async updateProxy(profileId: string, proxy: ProxyConfig): Promise<void> {
    await applyDecodoProxyToProfile(
      (path, init) => this.request(path, init),
      profileId,
      proxy,
    );
  }

  async getProfile(profileId: string): Promise<BrowserProfile | null> {
    try {
      const profile = await this.request<{
        id: string;
        name: string;
        navigator?: { language?: string };
        timezone?: { id?: string };
      }>(`/browser/${profileId}`);

      return {
        profileId: profile.id,
        provider: ProfileProvider.gologin,
        name: profile.name,
        deviceClass: "desktop",
        osFamily: "windows",
        locale: profile.navigator?.language ?? "en-AU",
        timezone: profile.timezone?.id ?? "Australia/Sydney",
        region: "NSW",
        city: "Sydney",
      };
    } catch {
      return null;
    }
  }

  /** Permanently remove a GoLogin cloud profile (frees plan seat). */
  async deleteProfile(profileId: string): Promise<void> {
    await this.request(`/browser/${profileId}`, { method: "DELETE" });
  }
}

export function createGoLoginProvider(): GoLoginProvider {
  const env = getEnv();
  if (!env.GOLOGIN_API_TOKEN) {
    throw new Error("GOLOGIN_API_TOKEN is required for GoLogin provider");
  }
  return new GoLoginProvider(env.GOLOGIN_API_TOKEN);
}

export { buildCloudConnectUrl, normalizeWsEndpoint, resolveConnectUrl } from "./gologin-utils.js";
