import { ProfileProvider } from "@prisma/client";
import { getEnv } from "../../config/env.js";
import type {
  BrowserProfile,
  BrowserProfileProvider,
  CreateProfileInput,
  RunningBrowser,
} from "./BrowserProfileProvider.js";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";

interface GoLoginStartResponse {
  wsUrl?: string;
  ws?: string;
}

export class GoLoginProvider implements BrowserProfileProvider {
  private readonly apiToken: string;
  private readonly baseUrl = "https://api.gologin.com";

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
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

    return response.json() as Promise<T>;
  }

  async createProfile(input: CreateProfileInput): Promise<BrowserProfile> {
    const payload = {
      name: input.name,
      browserType: "chrome",
      os: input.osFamily === "windows" ? "win" : input.osFamily === "mac" ? "mac" : "lin",
      navigator: {
        language: input.locale,
        userAgent: input.deviceClass === "mobile" ? "mobile" : "desktop",
        resolution: input.deviceClass === "mobile" ? "390x844" : "1366x768",
      },
      timezone: { id: input.timezone },
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
    if (proxy) {
      await this.updateProxy(profileId, proxy);
    }

    const started = await this.request<GoLoginStartResponse>(
      `/browser/${profileId}/web`,
      { method: "POST" },
    );

    const wsEndpoint = started.wsUrl ?? started.ws;
    if (!wsEndpoint) {
      throw new Error("GoLogin did not return a WebSocket endpoint");
    }

    return { profileId, wsEndpoint, cdpUrl: wsEndpoint };
  }

  async stopProfile(profileId: string): Promise<void> {
    await this.request(`/browser/${profileId}/web`, { method: "DELETE" });
  }

  async updateProxy(profileId: string, proxy: ProxyConfig): Promise<void> {
    await this.request(`/browser/${profileId}`, {
      method: "PUT",
      body: JSON.stringify({
        proxy: {
          mode: "http",
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password,
        },
      }),
    });
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
