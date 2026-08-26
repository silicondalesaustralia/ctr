import type { Page } from "playwright";
import { randomBetween, randomFloat, sleep } from "../utils/helpers.js";
import {
  effectivePauseMs,
  effectiveSerpScanMs,
} from "./behaviour-config.js";
import type { BehaviourEventCallback, Persona, SessionTraits } from "./types.js";

async function scrollSerpByFraction(page: Page, depthFraction: number): Promise<void> {
  const viewport = page.viewportSize()?.height ?? 768;
  const scrollPx = Math.round(viewport * depthFraction);
  if (scrollPx === 0) return;

  const steps = Math.max(1, Math.ceil(Math.abs(scrollPx) / 200));
  const stepSize = scrollPx / steps;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, stepSize);
    await sleep(randomBetween(120, 350));
  }
}

export async function inspectSerp(
  page: Page,
  persona: Persona,
  traits: SessionTraits,
  onEvent?: BehaviourEventCallback,
): Promise<void> {
  const scanRange = effectiveSerpScanMs(persona, traits);
  await sleep(randomBetween(scanRange[0], scanRange[1]));
  await onEvent?.("serp_inspected", {
    scanMs: randomBetween(scanRange[0], scanRange[1]),
  });

  if (Math.random() >= persona.serpScrollProbability) {
    return;
  }

  const depthFraction = randomFloat(
    persona.serpScrollDepth[0] * traits.attentionLevel,
    persona.serpScrollDepth[1] * traits.attentionLevel,
  );
  await scrollSerpByFraction(page, depthFraction);
  await onEvent?.("serp_scrolled", { depth: depthFraction });

  const pauseRange = effectivePauseMs([800, 2500], traits);
  await sleep(randomBetween(pauseRange[0], pauseRange[1]));

  if (Math.random() < 0.3) {
    await scrollSerpByFraction(page, -depthFraction * randomFloat(0.2, 0.6));
  }
}
