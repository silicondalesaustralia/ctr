import { randomInt } from "node:crypto";
import { generateFingerprint } from "camoufox-js/dist/fingerprints.js";
import { sampleWebGL } from "camoufox-js/dist/webgl/sample.js";
import type { Fingerprint } from "fingerprint-generator";
import { prisma } from "../../db/client.js";

export type CamoufoxOs = "windows" | "macos";

export interface PinnedFingerprint {
  os: CamoufoxOs;
  fingerprint: Fingerprint;
  webgl: [string, string];
  seeds: Record<string, number>;
}

const SEED_KEYS = ["fonts:spacing_seed", "audio:seed", "canvas:seed"] as const;

/** Realistic AU desktop screens; Camoufox sizes the window inside these. */
const SCREEN = { minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080 };

export function camoufoxOsFor(osFamily: string): CamoufoxOs {
  return osFamily === "mac" || osFamily === "macos" ? "macos" : "windows";
}

/** Generate a device once and persist it so every launch is the same machine. */
export async function createPinnedFingerprint(
  profileId: string,
  os: CamoufoxOs,
): Promise<PinnedFingerprint> {
  const fingerprint = generateFingerprint(undefined, {
    operatingSystems: [os],
    devices: ["desktop"],
    screen: SCREEN,
  });
  // camoufox-js types claim vendor/renderer, but the payload keys are "webGl:vendor"/"webGl:renderer".
  const sampled: Record<string, unknown> = { ...(await sampleWebGL(os === "macos" ? "mac" : "win")) };
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
      os,
      fingerprintJson: JSON.stringify(fingerprint),
      webglVendor: webglData.vendor,
      webglRenderer: webglData.renderer,
      seedsJson: JSON.stringify(seeds),
    },
  });

  return { os, fingerprint, webgl: [webglData.vendor, webglData.renderer], seeds };
}

export async function loadPinnedFingerprint(profileId: string): Promise<PinnedFingerprint> {
  const row = await prisma.browserFingerprint.findUnique({ where: { profileId } });
  if (!row) {
    throw new Error(`No pinned Camoufox fingerprint for profile ${profileId}`);
  }
  return {
    os: camoufoxOsFor(row.os),
    fingerprint: JSON.parse(row.fingerprintJson) as Fingerprint,
    webgl: [row.webglVendor, row.webglRenderer],
    seeds: JSON.parse(row.seedsJson) as Record<string, number>,
  };
}
