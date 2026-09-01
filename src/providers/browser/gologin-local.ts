import { chromium, type Browser, type BrowserContext } from "playwright";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";
import type { RunningBrowser } from "./BrowserProfileProvider.js";

export interface LocalLaunchHints {
  locale?: string;
  timezone?: string;
  deviceClass?: "mobile" | "desktop";
  userAgent?: string;
}

/**
 * Run Chromium on the worker with Decodo (or other) proxy.
 * GoLogin cloud cannot reach Decodo from Hetzner hosts; local launch can.
 */
export async function startLocalChromiumWithProxy(
  profileId: string,
  proxy: ProxyConfig,
  hints: LocalLaunchHints = {},
): Promise<RunningBrowser> {
  const deviceClass = hints.deviceClass ?? "desktop";
  const launchOptions: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    proxy: {
      server: `http://${proxy.host}:${proxy.port}`,
      username: proxy.username,
      password: proxy.password,
    },
  };

  const browser: Browser = await chromium.launch(launchOptions);
  const context: BrowserContext = await browser.newContext({
    locale: hints.locale ?? "en-AU",
    timezoneId: hints.timezone ?? "Australia/Adelaide",
    viewport:
      deviceClass === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1366, height: 768 },
    userAgent:
      hints.userAgent ??
      (deviceClass === "mobile"
        ? "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        : undefined),
  });

  console.error(
    `[gologin] Local Chromium started for ${profileId} via ${proxy.host}:${proxy.port}`,
  );

  return { profileId, browser, context };
}

export async function stopLocalChromium(running?: RunningBrowser): Promise<void> {
  if (running?.context) {
    await running.context.close().catch(() => undefined);
  }
  if (running?.browser) {
    await running.browser.close().catch(() => undefined);
  }
}
