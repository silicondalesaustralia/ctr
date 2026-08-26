import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { DeviceClass, Identity } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { hashValue } from "../utils/helpers.js";
import { pickBranch } from "./action-tree.js";
import type { BehaviourOverrides, DeviceFilter, Persona } from "./types.js";

const tuple2 = z.tuple([z.number(), z.number()]);

const personaSchema = z.object({
  weight: z.number().min(0).max(1),
  device_filter: z.enum(["any", "desktop", "mobile"]).default("any"),
  typing_speed: z.enum(["fast", "medium", "normal", "slow"]).default("normal"),
  typing_delay_ms: tuple2,
  pre_type_pause_ms: tuple2,
  post_type_pause_ms: tuple2,
  serp_scan_seconds: tuple2,
  serp_scroll_probability: z.number().min(0).max(1),
  serp_scroll_depth: tuple2,
  reformulate_probability: z.number().min(0).max(1),
  max_searches_per_session: z.number().int().positive(),
  abandon_before_inspect_probability: z.number().min(0).max(1).default(0.08),
  target_click_probability_if_found: z.number().min(0).max(1),
  page_depth: z.enum(["shallow", "medium", "deep"]),
  internal_click_probability: z.number().min(0).max(1),
  back_to_serp_probability: z.number().min(0).max(1),
  max_internal_pages: z.number().int().positive(),
  dwell_seconds: tuple2,
});

const personasFileSchema = z.object({
  personas: z.record(personaSchema),
});

let cachedPersonas: Persona[] | null = null;

function mapPersona(id: string, raw: z.infer<typeof personaSchema>): Persona {
  return {
    id,
    weight: raw.weight,
    deviceFilter: raw.device_filter as DeviceFilter,
    typingSpeed: raw.typing_speed,
    typingDelayMs: raw.typing_delay_ms,
    preTypePauseMs: raw.pre_type_pause_ms,
    postTypePauseMs: raw.post_type_pause_ms,
    serpScanSeconds: raw.serp_scan_seconds,
    serpScrollProbability: raw.serp_scroll_probability,
    serpScrollDepth: raw.serp_scroll_depth,
    reformulateProbability: raw.reformulate_probability,
    maxSearchesPerSession: raw.max_searches_per_session,
    abandonBeforeInspectProbability: raw.abandon_before_inspect_probability,
    targetClickProbabilityIfFound: raw.target_click_probability_if_found,
    pageDepth: raw.page_depth,
    internalClickProbability: raw.internal_click_probability,
    backToSerpProbability: raw.back_to_serp_probability,
    maxInternalPages: raw.max_internal_pages,
    dwellSeconds: raw.dwell_seconds,
  };
}

export function loadPersonas(): Persona[] {
  if (cachedPersonas) {
    return cachedPersonas;
  }

  const filePath = join(process.cwd(), "config", "personas.yml");
  const parsed = personasFileSchema.parse(parseYaml(readFileSync(filePath, "utf8")));
  cachedPersonas = Object.entries(parsed.personas).map(([id, raw]) => mapPersona(id, raw));
  return cachedPersonas;
}

export function getPersonaById(personaId: string): Persona | null {
  return loadPersonas().find((persona) => persona.id === personaId) ?? null;
}

function filterEligiblePersonas(
  deviceClass: DeviceClass,
  overrides?: BehaviourOverrides,
): Persona[] {
  const all = loadPersonas();
  const eligible = all.filter((persona) => {
    if (persona.deviceFilter === "any") return true;
    return persona.deviceFilter === deviceClass;
  });

  if (!overrides?.personaWeights) {
    return eligible;
  }

  return eligible.map((persona) => ({
    ...persona,
    weight: overrides.personaWeights?.[persona.id] ?? persona.weight,
  }));
}

export function assignPersona(
  deviceClass: DeviceClass,
  seed: string,
  overrides?: BehaviourOverrides,
): Persona {
  const forced = process.env.BEHAVIOUR_PERSONA?.trim();
  if (forced) {
    const persona = getPersonaById(forced);
    if (persona) {
      return persona;
    }
  }

  const eligible = filterEligiblePersonas(deviceClass, overrides);
  if (eligible.length === 0) {
    throw new Error(`No personas eligible for device class ${deviceClass}`);
  }

  const seedValue = Number.parseInt(hashValue(seed).slice(0, 8), 16) / 0xffffffff;
  const branches = Object.fromEntries(
    eligible.map((persona) => [persona.id, persona.weight]),
  ) as Record<string, number>;

  const personaId = pickBranch(branches, seedValue);
  return eligible.find((persona) => persona.id === personaId) ?? eligible[0]!;
}

export async function getPersonaForIdentity(
  identity: Identity,
  overrides?: BehaviourOverrides,
): Promise<Persona> {
  if (identity.personaId) {
    const existing = getPersonaById(identity.personaId);
    if (existing) {
      return existing;
    }
  }

  const persona = assignPersona(identity.deviceClass, identity.externalId, overrides);
  await prisma.identity.update({
    where: { id: identity.id },
    data: {
      personaId: persona.id,
      personaAssignedAt: new Date(),
    },
  });

  return persona;
}

export const FAST_DRY_RUN_PERSONA: Persona = {
  id: "dry_run",
  weight: 1,
  deviceFilter: "any",
  typingSpeed: "fast",
  typingDelayMs: [20, 40],
  preTypePauseMs: [200, 400],
  postTypePauseMs: [200, 400],
  serpScanSeconds: [0.5, 1],
  serpScrollProbability: 0,
  serpScrollDepth: [0.1, 0.2],
  reformulateProbability: 0,
  maxSearchesPerSession: 1,
  abandonBeforeInspectProbability: 0,
  targetClickProbabilityIfFound: 1,
  pageDepth: "shallow",
  internalClickProbability: 0,
  backToSerpProbability: 0,
  maxInternalPages: 0,
  dwellSeconds: [2, 4],
};
