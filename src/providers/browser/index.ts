import { getEnv } from "../../config/env.js";
import { createGoLoginProvider } from "./GoLoginProvider.js";
import { MultiloginProvider } from "./MultiloginProvider.js";
import { MockBrowserProfileProvider } from "./MockBrowserProfileProvider.js";
import type { BrowserProfileProvider } from "./BrowserProfileProvider.js";

let mockProvider: MockBrowserProfileProvider | null = null;

export function createBrowserProvider(): BrowserProfileProvider {
  const env = getEnv();
  if (env.BROWSER_PROFILE_PROVIDER === "gologin") {
    return createGoLoginProvider();
  }
  if (env.BROWSER_PROFILE_PROVIDER === "multilogin") {
    return MultiloginProvider.create();
  }
  if (!mockProvider) {
    mockProvider = new MockBrowserProfileProvider();
  }
  return mockProvider;
}

export function getMockBrowserProvider(): MockBrowserProfileProvider {
  if (!mockProvider) {
    mockProvider = new MockBrowserProfileProvider();
  }
  return mockProvider;
}
