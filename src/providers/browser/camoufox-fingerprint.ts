import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { generateFingerprint } from "camoufox-js/dist/fingerprints.js";
import { getPath } from "camoufox-js/dist/pkgman.js";
import { sampleWebGL } from "camoufox-js/dist/webgl/sample.js";
import type { Fingerprint } from "fingerprint-generator";
import { prisma } from "../../db/client.js";
import { ANDROID_OS } from "./camoufox-mobile.js";

export type CamoufoxOs = "windows" | "macos" | "linux";

const WEBGL_OS = { windows: "win", macos: "mac", linux: "lin" } as const;

export interface PinnedFingerprint {
  os: CamoufoxOs;
  /** Firefox-for-Android identity: launch with the mobile overrides. */
  mobile: boolean;
  fingerprint: Fingerprint;
  webgl: [string, string];
  seeds: Record<string, number>;
}

const SEED_KEYS = ["fonts:spacing_seed", "audio:seed", "canvas:seed"] as const;

/** Realistic AU desktop screens; Camoufox sizes the window inside these. */
const SCREEN = { minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080 };

let knownProperties: Set<string> | null = null;

/** Property names the installed Camoufox build accepts; launches fail on any other key. */
function installedCamoufoxProperties(): Set<string> {
  if (!knownProperties) {
    const entries = JSON.parse(readFileSync(getPath("properties.json"), "utf8")) as Array<{ property: string }>;
    knownProperties = new Set(entries.map((entry) => entry.property));
  }
  return knownProperties;
}

/** Pinned seeds minus any the installed browser dropped (e.g. fonts:spacing_seed in newer builds). */
export function supportedSeeds(seeds: Record<string, number>): Record<string, number> {
  return supportedConfig(seeds);
}

/** Config keys the installed Camoufox build accepts. */
export function supportedConfig<T>(config: Record<string, T>): Record<string, T> {
  const known = installedCamoufoxProperties();
  return Object.fromEntries(Object.entries(config).filter(([key]) => known.has(key)));
}

export function camoufoxOsFor(osFamily: string): CamoufoxOs {
  if (osFamily === ANDROID_OS || osFamily === "linux") return "linux";
  return osFamily === "mac" || osFamily === "macos" ? "macos" : "windows";
}

/** Generate a device once and persist it so every launch is the same machine. */
export async function createPinnedFingerprint(
  profileId: string,
  osFamily: string,
): Promise<PinnedFingerprint> {
  const os = camoufoxOsFor(osFamily);
  const mobile = osFamily === ANDROID_OS;
  const fingerprint = generateFingerprint(undefined, {
    operatingSystems: [os],
    devices: ["desktop"],
    screen: SCREEN,
  });
  // camoufox-js types claim vendor/renderer, but the payload keys are "webGl:vendor"/"webGl:renderer".
  const sampled: Record<string, unknown> = { ...(await sampleWebGL(WEBGL_OS[os])) };
  const vendor = sampled["webGl:vendor"];
  const renderer = sampled["webGl:renderer"];
  if (typeof vendor !== "string" || typeof renderer !== "string") {
    throw new Error("Camoufox WebGL sample missing webGl:vendor / webGl:renderer");
  }
  const webglData = { vendor, renderer };
  const seeds: Record<string, number> = {};
  for (const key of SEED_KEYS) {
    seeds[key] = randomInt(1, 4_294_967_295);
  }

  await prisma.browserFingerprint.create({
    data: {
      profileId,
      os: mobile ? ANDROID_OS : os,
      fingerprintJson: JSON.stringify(fingerprint),
      webglVendor: webglData.vendor,
      webglRenderer: webglData.renderer,
      seedsJson: JSON.stringify(seeds),
    },
  });

  return { os, mobile, fingerprint, webgl: [webglData.vendor, webglData.renderer], seeds };
}

export async function loadPinnedFingerprint(profileId: string): Promise<PinnedFingerprint> {
  const row = await prisma.browserFingerprint.findUnique({ where: { profileId } });
  if (!row) {
    throw new Error(`No pinned Camoufox fingerprint for profile ${profileId}`);
  }
  return {
    os: camoufoxOsFor(row.os),
    mobile: row.os === ANDROID_OS,
    fingerprint: JSON.parse(row.fingerprintJson) as Fingerprint,
    webgl: [row.webglVendor, row.webglRenderer],
    seeds: JSON.parse(row.seedsJson) as Record<string, number>,
  };
}
