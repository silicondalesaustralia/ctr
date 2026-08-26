import { join } from "node:path";
import { loadExperimentConfig } from "../config/experiments.js";
import type { BehaviourOverrides } from "./types.js";

export function loadBehaviourOverrides(experimentSlug: string): BehaviourOverrides {
  try {
    const filePath = join(process.cwd(), "experiments", `${experimentSlug}.yml`);
    const config = loadExperimentConfig(filePath);
    if (!config.behaviour) {
      return {};
    }

    return {
      personaWeights: config.behaviour.persona_weights,
      allowQueryReformulation: config.behaviour.allow_query_reformulation,
      allowSearchAbandon: config.behaviour.allow_search_abandon,
      allowTargetSkip: config.behaviour.allow_target_skip,
    };
  } catch {
    return {};
  }
}
