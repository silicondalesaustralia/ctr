import type { BrowserProfileProvider, CreateProfileInput, BrowserProfile, RunningBrowser } from "./BrowserProfileProvider.js";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";
import { ProfileProvider } from "@prisma/client";
import { getEnv } from "../../config/env.js";

export class MultiloginProvider implements BrowserProfileProvider {
  private readonly apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async createProfile(input: CreateProfileInput): Promise<BrowserProfile> {
    throw new Error(
      `Multilogin provider is not configured yet. Profile ${input.name} was not created.`,
    );
  }

  async startProfile(_profileId: string, _proxy?: ProxyConfig): Promise<RunningBrowser> {
    throw new Error("Multilogin provider is not configured yet.");
  }

  async stopProfile(_profileId: string): Promise<void> {
    return;
  }

  async updateProxy(_profileId: string, _proxy: ProxyConfig): Promise<void> {
    throw new Error("Multilogin provider is not configured yet.");
  }

  async getProfile(_profileId: string): Promise<BrowserProfile | null> {
    return null;
  }

  static create(): MultiloginProvider {
    const token = getEnv().MULTILOGIN_API_TOKEN;
    if (!token) {
      throw new Error("MULTILOGIN_API_TOKEN is required for Multilogin provider");
    }
    return new MultiloginProvider(token);
  }
}

export function createMultiloginProfileDefaults(input: CreateProfileInput): BrowserProfile {
  return {
    profileId: "multilogin-not-configured",
    provider: ProfileProvider.multilogin,
    name: input.name,
    deviceClass: input.deviceClass,
    osFamily: input.osFamily,
    locale: input.locale,
    timezone: input.timezone,
    region: input.region,
    city: input.city,
  };
}
