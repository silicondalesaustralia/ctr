import type { DeviceClass, ProfileProvider } from "@prisma/client";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";

export interface CreateProfileInput {
  name: string;
  deviceClass: DeviceClass;
  osFamily: string;
  locale: string;
  timezone: string;
  region: string;
  city: string;
}

export interface BrowserProfile {
  profileId: string;
  provider: ProfileProvider;
  name: string;
  deviceClass: DeviceClass;
  osFamily: string;
  locale: string;
  timezone: string;
  region: string;
  city: string;
}

export interface RunningBrowser {
  profileId: string;
  cdpUrl?: string;
  wsEndpoint?: string;
  /** Redis token for the single GoLogin cloud-slot lock (plan allows 1 parallel). */
  slotToken?: string;
  /** How the browser was started — drives cleanup. */
  runtime?: "cloud" | "orbita" | "chromium";
  browser?: import("playwright").Browser;
  context?: import("playwright").BrowserContext;
}

export interface BrowserProfileProvider {
  createProfile(input: CreateProfileInput): Promise<BrowserProfile>;
  startProfile(profileId: string, proxy?: ProxyConfig): Promise<RunningBrowser>;
  stopProfile(profileId: string, running?: RunningBrowser): Promise<void>;
  updateProxy(profileId: string, proxy: ProxyConfig): Promise<void>;
  getProfile(profileId: string): Promise<BrowserProfile | null>;
}
