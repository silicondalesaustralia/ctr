import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { ProfileProvider, type DeviceClass } from "@prisma/client";
import type {
  BrowserProfile,
  BrowserProfileProvider,
  CreateProfileInput,
  RunningBrowser,
} from "./BrowserProfileProvider.js";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";

interface StoredProfile extends BrowserProfile {
  proxy?: ProxyConfig;
}

const profiles = new Map<string, StoredProfile>();
const running = new Map<string, { browser: Browser; context: BrowserContext }>();

export class MockBrowserProfileProvider implements BrowserProfileProvider {
  async createProfile(input: CreateProfileInput): Promise<BrowserProfile> {
    const profileId = randomUUID();
    const profile: StoredProfile = {
      profileId,
      provider: ProfileProvider.mock,
      name: input.name,
      deviceClass: input.deviceClass,
      osFamily: input.osFamily,
      locale: input.locale,
      timezone: input.timezone,
      region: input.region,
      city: input.city,
    };
    profiles.set(profileId, profile);
    return profile;
  }

  async startProfile(profileId: string, proxy?: ProxyConfig): Promise<RunningBrowser> {
    const profile = profiles.get(profileId);
    if (!profile) {
      throw new Error(`Mock profile not found: ${profileId}`);
    }

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: true,
    };

    if (proxy && proxy.port > 0) {
      launchOptions.proxy = {
        server: `http://${proxy.host}:${proxy.port}`,
        username: proxy.username,
        password: proxy.password,
      };
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      locale: profile.locale,
      timezoneId: profile.timezone,
      viewport:
        profile.deviceClass === "mobile"
          ? { width: 390, height: 844 }
          : { width: 1366, height: 768 },
      userAgent:
        profile.deviceClass === "mobile"
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
          : undefined,
    });

    running.set(profileId, { browser, context });

    return {
      profileId,
      browser,
      context,
    };
  }

  async stopProfile(profileId: string, runningBrowser?: RunningBrowser): Promise<void> {
    const active = running.get(profileId);
    if (active) {
      await active.context.close();
      await active.browser.close();
      running.delete(profileId);
      return;
    }

    if (runningBrowser?.browser) {
      await runningBrowser.context?.close();
      await runningBrowser.browser.close();
    }
  }

  async updateProxy(profileId: string, proxy: ProxyConfig): Promise<void> {
    const profile = profiles.get(profileId);
    if (!profile) {
      throw new Error(`Mock profile not found: ${profileId}`);
    }
    profile.proxy = proxy;
    profiles.set(profileId, profile);
  }

  async getProfile(profileId: string): Promise<BrowserProfile | null> {
    return profiles.get(profileId) ?? null;
  }

  registerExistingProfile(profile: BrowserProfile): void {
    profiles.set(profile.profileId, profile);
  }
}

export function getMockProfileStore(): Map<string, StoredProfile> {
  return profiles;
}
