import type { ExperimentQuery, QueryType } from "@prisma/client";
import { selectWeightedQuery } from "../experiments/experiment-service.js";
import { effectiveReformulateProbability } from "./behaviour-config.js";
import type { Persona, SessionTraits } from "./types.js";

const REFINEMENT_GRAPH: Record<QueryType, QueryType[]> = {
  core: ["close_variation", "local", "long_tail"],
  close_variation: ["local", "long_tail", "core"],
  local: ["long_tail", "close_variation"],
  long_tail: ["local", "close_variation"],
  semantic: ["core", "close_variation"],
};

export function resolveInitialQuery(
  queryText: string,
  cluster: ExperimentQuery[],
): ExperimentQuery {
  const exact = cluster.find((query) => query.query === queryText);
  if (exact) {
    return exact;
  }

  return {
    id: "adhoc",
    experimentId: cluster[0]?.experimentId ?? "",
    query: queryText,
    queryType: "core",
    weight: 1,
    active: true,
    createdAt: new Date(),
  };
}

export function pickReformulatedQuery(
  current: ExperimentQuery,
  cluster: ExperimentQuery[],
  usedQueries: Set<string>,
): ExperimentQuery | null {
  const allowedTypes = REFINEMENT_GRAPH[current.queryType];
  const candidates = cluster.filter(
    (query) =>
      query.active &&
      query.id !== current.id &&
      !usedQueries.has(query.query) &&
      allowedTypes.includes(query.queryType),
  );

  if (candidates.length === 0) {
    const fallback = cluster.filter(
      (query) => query.active && !usedQueries.has(query.query) && query.id !== current.id,
    );
    if (fallback.length === 0) {
      return null;
    }
    return selectWeightedQuery(fallback);
  }

  return selectWeightedQuery(candidates);
}

export function shouldReformulate(
  persona: Persona,
  traits: SessionTraits,
  random = Math.random(),
): boolean {
  return random < effectiveReformulateProbability(persona, traits);
}

export function shouldAbandonBeforeInspect(
  persona: Persona,
  traits: SessionTraits,
  allowSearchAbandon: boolean,
  random = Math.random(),
): boolean {
  if (!allowSearchAbandon) {
    return false;
  }
  const probability =
    persona.abandonBeforeInspectProbability / traits.searchConfidence;
  return random < Math.min(0.35, probability);
}

export function shouldClickTarget(
  persona: Persona,
  traits: SessionTraits,
  allowTargetSkip: boolean,
  random = Math.random(),
): boolean {
  if (!allowTargetSkip) {
    return true;
  }
  const probability = persona.targetClickProbabilityIfFound * (0.85 + traits.searchConfidence * 0.15);
  return random < Math.min(0.98, Math.max(0.5, probability));
}
