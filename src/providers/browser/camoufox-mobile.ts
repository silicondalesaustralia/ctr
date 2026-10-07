import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getPath } from "camoufox-js/dist/pkgman.js";

/** Pinned-fingerprint os value marking a Firefox-for-Android identity (launched as Camoufox linux). */
export const ANDROID_OS = "android";

/** Common Android portrait viewports in CSS pixels. */
const PHONES = [
  { width: 412, height: 915 },
  { width: 360, height: 780 },
  { width: 384, height: 854 },
  { width: 384, height: 824 },
  { width: 393, height: 873 },
] as const;
const ANDROID_VERSIONS = [13, 14, 15] as const;
/** Firefox for Android URL bar + status bar. */
const BROWSER_CHROME_HEIGHT = 76;

let firefoxMajor: number | null = null;

/** Firefox major of the installed Camoufox build, so the spoofed Android UA matches the engine. */
export function camoufoxFirefoxMajor(): number {
  if (firefoxMajor === null) {
    const platformIni = readFileSync(join(dirname(getPath("properties.json")), "platform.ini"), "utf8");
    const milestone = platformIni.match(/^Milestone=(\d+)/m)?.[1];
    if (!milestone) throw new Error("Could not read Camoufox Firefox version from platform.ini");
    firefoxMajor = Number(milestone);
  }
  return firefoxMajor;
}

export interface MobileLaunchOverrides {
  config: Record<string, string | number | string[]>;
  window: [number, number];
  firefox_user_prefs: Record<string, string>;
  userAgent: string;
}

function pick<T>(items: readonly T[], seed: string, salt: string): T {
  const index = createHash("sha256").update(`${salt}:${seed}`).digest().readUInt32BE(0) % items.length;
  const item = items[index];
  if (item === undefined) throw new Error("Empty device preset list");
  return item;
}

/** Firefox-for-Android overrides; the same seed (profile id) always gets the same phone. */
export function firefoxAndroidOverrides(seed = "default"): MobileLaunchOverrides {
  const major = camoufoxFirefoxMajor();
  const phone = pick(PHONES, seed, "screen");
  const android = pick(ANDROID_VERSIONS, seed, "android");
  const userAgent = `Mozilla/5.0 (Android ${android}; Mobile; rv:${major}.0) Gecko/${major}.0 Firefox/${major}.0`;
  return {
    userAgent,
    window: [phone.width, phone.height],
    // Android's system sans-serif; needs fonts-roboto on the host (see Dockerfile).
    firefox_user_prefs: {
      "general.useragent.override": userAgent,
      "font.name.sans-serif.x-western": "Roboto",
      "font.name.sans-serif.x-unicode": "Roboto",
    },
    config: {
      fonts: ["Roboto"],
      "navigator.userAgent": userAgent,
      "headers.User-Agent": userAgent,
      "navigator.appVersion": `5.0 (Android ${android})`,
      "navigator.platform": "Linux armv81",
      "navigator.oscpu": "Linux armv81",
      "navigator.maxTouchPoints": 5,
      "screen.width": phone.width,
      "screen.height": phone.height,
      "screen.availWidth": phone.width,
      "screen.availHeight": phone.height,
      "screen.colorDepth": 24,
      "screen.pixelDepth": 24,
      "window.outerWidth": phone.width,
      "window.outerHeight": phone.height,
      "window.innerWidth": phone.width,
      "window.innerHeight": phone.height - BROWSER_CHROME_HEIGHT,
    },
  };
}
