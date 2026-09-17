import type { Page } from "./pw.js";

const STEALTH_SOURCE = `(() => {
  try {
    Object.defineProperty(Navigator.prototype, "webdriver", {
      get: () => undefined,
      configurable: true,
    });
  } catch {}

  try {
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, "webdriver");
    if (desc && desc.configurable) {
      Object.defineProperty(Navigator.prototype, "webdriver", {
        get: () => undefined,
        configurable: true,
      });
    }
  } catch {}

  try {
    if (!window.chrome) {
      window.chrome = { runtime: {} };
    }
  } catch {}

  try {
    const originalQuery = window.navigator.permissions && window.navigator.permissions.query
      ? window.navigator.permissions.query.bind(window.navigator.permissions)
      : null;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) => {
        if (parameters && parameters.name === "notifications") {
          return Promise.resolve({
            state: Notification.permission,
            onchange: null,
          });
        }
        return originalQuery(parameters);
      };
    }
  } catch {}

  try {
    if (!navigator.plugins || navigator.plugins.length === 0) {
      Object.defineProperty(Navigator.prototype, "plugins", {
        get: () => [{ name: "Chrome PDF Plugin" }, { name: "Chrome PDF Viewer" }],
        configurable: true,
      });
    }
  } catch {}

  try {
    Object.defineProperty(Navigator.prototype, "languages", {
      get: () => ["en-AU", "en-GB", "en"],
      configurable: true,
    });
  } catch {}
})()`;

/**
 * Reduce common Playwright/CDP automation signals before Google.
 * Orbita handles much of the fingerprint; this covers navigator leaks
 * that still show up under CDP control.
 */
export async function applyBrowserStealth(page: Page): Promise<void> {
  await page.context().addInitScript({ content: STEALTH_SOURCE });
  await page.addInitScript({ content: STEALTH_SOURCE });
  await page.evaluate(STEALTH_SOURCE).catch(() => undefined);
}
