import { ProfileProvider } from "@prisma/client";
import { getEnv } from "../../config/env.js";
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

type GoLoginProxyState = {
  mode?: string;
  host?: string;
  port?: number;
  username?: string;
};

export class GoLoginProvider implements BrowserProfileProvider {
  private readonly apiToken: string;
  private readonly baseUrl = "https://api.gologin.com";

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(30_000),
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
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
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
    const userAgent =
      input.deviceClass === "mobile"
        ? "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        : os === "mac"
          ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const payload = {
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
    };

    const created = await this.request<{ id: string }>("/browser", {
      method: "POST",
      body: JSON.stringify(payload),
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
        body: JSON.stringify({ isHeadless: true }),
      });

      console.error("[gologin] Waiting for cloud container boot...");
      await sleep(15_000);

      const wsEndpoint = resolveConnectUrl(started, profileId, this.apiToken);
      console.error(`[gologin] Connect URL resolved (${wsEndpoint.startsWith("wss://") ? "wss" : "ws"})`);

      return { profileId, wsEndpoint, cdpUrl: wsEndpoint, slotToken };
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
      await this.stopCloudSession(profileId, { alreadyStoppedOk: true });
    } finally {
      await releaseGoLoginSlot(running?.slotToken);
    }
  }

  async updateProxy(profileId: string, proxy: ProxyConfig): Promise<void> {
    console.error(
      `[gologin] Updating proxy on ${profileId} → ${proxy.host}:${proxy.port} user=${proxy.username.slice(0, 36)}…`,
    );

    const proxyPayload = {
      mode: "http" as const,
      host: proxy.host,
      port: Number(proxy.port),
      username: proxy.username,
      password: proxy.password,
      customName: `decodo-${proxy.sessionKey ?? profileId}`.slice(0, 60),
    };

    // Dedicated multi-profile proxy endpoint (most reliable for sticking credentials).
    try {
      await this.request(`/browser/proxy/many/v2`, {
        method: "PATCH",
        body: JSON.stringify({
          proxies: [{ profileId, proxy: proxyPayload }],
        }),
      });
      console.error(`[gologin] Proxy PATCH /browser/proxy/many/v2 ok for ${profileId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[gologin] proxy/many/v2 failed (${message}); trying /custom`);
      await this.request(`/browser/${profileId}/custom`, {
        method: "PUT",
        body: JSON.stringify({ proxy: proxyPayload }),
      });
    }

    const verified = await this.request<{ proxy?: GoLoginProxyState }>(`/browser/${profileId}`);
    const applied = verified.proxy;
    const mode = typeof applied?.mode === "string" ? applied.mode : String(applied?.mode ?? "");
    const host = applied?.host ?? "";
    const username = applied?.username ?? "";

    console.error(
      `[gologin] Proxy readback mode=${mode || "none"} host=${host || "none"} user=${username.slice(0, 36) || "none"}…`,
    );

    if (mode !== "http" || host !== proxy.host) {
      throw new Error(
        `GoLogin proxy not applied for ${profileId}: mode=${mode || "none"} host=${host || "none"}`,
      );
    }
    if (!username || username !== proxy.username) {
      throw new Error(
        `GoLogin proxy username mismatch for ${profileId}: expected sticky Decodo user, got ${username.slice(0, 48) || "empty"}`,
      );
    }
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
}

export function createGoLoginProvider(): GoLoginProvider {
  const env = getEnv();
  if (!env.GOLOGIN_API_TOKEN) {
    throw new Error("GOLOGIN_API_TOKEN is required for GoLogin provider");
  }
  return new GoLoginProvider(env.GOLOGIN_API_TOKEN);
}

export { buildCloudConnectUrl, normalizeWsEndpoint, resolveConnectUrl } from "./gologin-utils.js";
