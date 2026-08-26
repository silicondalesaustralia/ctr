import { isDryRun } from "../config/env.js";
import { randomBetween, randomFloat, sleep } from "../utils/helpers.js";
import type { Persona, SessionTraits } from "./types.js";

export function isProbabilisticBehaviourEnabled(): boolean {
  if (isDryRun()) return false;
  if (process.env.BEHAVIOUR_SKIP_PROBABILISTIC === "true") return false;
  return true;
}

export function scaledRange(
  range: [number, number],
  multiplier: number,
): [number, number] {
  return [range[0] * multiplier, range[1] * multiplier];
}

export function effectiveTypingDelayMs(
  persona: Persona,
  traits: SessionTraits,
): [number, number] {
  return scaledRange(persona.typingDelayMs, 1 / traits.pace);
}

export function effectivePauseMs(
  range: [number, number],
  traits: SessionTraits,
): [number, number] {
  return scaledRange(range, 1 / traits.pace);
}

export function effectiveSerpScanMs(
  persona: Persona,
  traits: SessionTraits,
): [number, number] {
  const seconds = scaledRange(persona.serpScanSeconds, traits.attentionLevel);
  return [seconds[0] * 1000, seconds[1] * 1000];
}

export function effectiveDwellMs(
  persona: Persona,
  traits: SessionTraits,
): [number, number] {
  const seconds = scaledRange(persona.dwellSeconds, traits.attentionLevel);
  return [seconds[0] * 1000, seconds[1] * 1000];
}

export function effectiveReformulateProbability(
  persona: Persona,
  traits: SessionTraits,
): number {
  return Math.min(0.95, persona.reformulateProbability / traits.searchConfidence);
}

export function effectiveInternalClickProbability(
  persona: Persona,
  traits: SessionTraits,
): number {
  return Math.min(0.95, persona.internalClickProbability * traits.curiosity);
}

export function effectiveMaxInternalPages(
  persona: Persona,
  traits: SessionTraits,
): number {
  return Math.max(0, Math.round(persona.maxInternalPages * traits.navigationDepth));
}

export function effectiveTargetClickProbability(
  persona: Persona,
  traits: SessionTraits,
): number {
  const base = persona.targetClickProbabilityIfFound;
  const adjusted = base * (0.85 + traits.searchConfidence * 0.15);
  return Math.min(0.98, Math.max(0.5, adjusted));
}

export function effectiveAbandonProbability(
  persona: Persona,
  traits: SessionTraits,
): number {
  return Math.min(
    0.35,
    persona.abandonBeforeInspectProbability / traits.searchConfidence,
  );
}
