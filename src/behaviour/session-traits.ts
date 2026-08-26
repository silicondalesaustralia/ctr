import { createHash } from "node:crypto";
import { hashValue } from "../utils/helpers.js";
import type { Persona, SessionTraits } from "./types.js";

function seededUnit(seed: string, salt: string): number {
  const digest = createHash("sha256").update(`${seed}:${salt}`).digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff;
}

function gaussianFromSeeds(seed: string, salt: string, mean: number, std: number): number {
  const u1 = Math.max(seededUnit(seed, `${salt}:u1`), 1e-6);
  const u2 = seededUnit(seed, `${salt}:u2`);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function generateSessionTraits(
  persona: Persona,
  sessionId: string,
  identityExternalId: string,
): SessionTraits {
  const seed = `${sessionId}:${identityExternalId}:${persona.id}`;

  const pace = clamp(0.6, 1.4, gaussianFromSeeds(seed, "pace", 1.0, 0.15));
  const attentionLevel = clamp(
    0.5,
    1.5,
    gaussianFromSeeds(seed, "attention", 1.0, 0.2) * (1 + (1 - pace) * 0.15),
  );
  const curiosity = clamp(0.3, 1.7, gaussianFromSeeds(seed, "curiosity", 1.0, 0.25));
  const searchConfidence = clamp(0.4, 1.6, gaussianFromSeeds(seed, "confidence", 1.0, 0.2));
  const navigationDepth = clamp(0.2, 1.8, gaussianFromSeeds(seed, "navigation", 1.0, 0.25));

  return {
    pace,
    attentionLevel,
    curiosity,
    searchConfidence,
    navigationDepth,
  };
}

export function traitsToJson(traits: SessionTraits): string {
  return JSON.stringify(traits);
}

export function traitsSeedHash(sessionId: string, identityExternalId: string): string {
  return hashValue(`${sessionId}:${identityExternalId}`);
}
