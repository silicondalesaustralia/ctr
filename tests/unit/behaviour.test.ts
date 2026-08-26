import { describe, expect, it } from "vitest";
import { pickBranch, normalizeWeights } from "../../src/behaviour/action-tree.js";
import { assignPersona, loadPersonas } from "../../src/behaviour/personas.js";
import {
  pickReformulatedQuery,
  resolveInitialQuery,
  shouldClickTarget,
} from "../../src/behaviour/query-evolution.js";
import { generateSessionTraits } from "../../src/behaviour/session-traits.js";
import { DeviceClass, type ExperimentQuery, type QueryType } from "@prisma/client";

function makeQuery(
  text: string,
  queryType: QueryType,
  weight: number,
  id = text,
): ExperimentQuery {
  return {
    id,
    experimentId: "exp1",
    query: text,
    queryType,
    weight,
    active: true,
    createdAt: new Date(),
    monthlySearchVolume: null,
    startingPosition: null,
    gscImpressions28d: null,
    gscClicks28d: null,
    allocatedSessions: null,
  };
}

describe("behaviour engine", () => {
  it("loads personas from config", () => {
    const personas = loadPersonas();
    expect(personas.length).toBeGreaterThanOrEqual(4);
    expect(personas.some((persona) => persona.id === "normal_researcher")).toBe(true);
  });

  it("assigns personas deterministically from seed", () => {
    const first = assignPersona(DeviceClass.mobile, "au_008");
    const second = assignPersona(DeviceClass.mobile, "au_008");
    expect(first.id).toBe(second.id);
  });

  it("generates stable session traits for the same seed", () => {
    const persona = loadPersonas()[0]!;
    const first = generateSessionTraits(persona, "session-a", "au_008");
    const second = generateSessionTraits(persona, "session-a", "au_008");
    expect(first).toEqual(second);
  });

  it("picks reformulated query from allowed types only", () => {
    const cluster = [
      makeQuery("womens breeches", "core", 0.4),
      makeQuery("womens breeches australia", "local", 0.15, "local-q"),
      makeQuery("buy womens breeches online australia", "long_tail", 0.05, "long-q"),
    ];
    const current = cluster[0]!;
    const next = pickReformulatedQuery(current, cluster, new Set([current.query]));
    expect(next).not.toBeNull();
    expect(["local", "long_tail", "close_variation"]).toContain(next?.queryType);
  });

  it("resolves initial query from cluster", () => {
    const cluster = [makeQuery("womens breeches", "core", 1)];
    const resolved = resolveInitialQuery("womens breeches", cluster);
    expect(resolved.query).toBe("womens breeches");
  });

  it("normalizes branch weights", () => {
    const normalized = normalizeWeights({
      a: 1,
      b: 1,
    });
    expect(normalized.a + normalized.b).toBeCloseTo(1);
  });

  it("picks deterministic branch", () => {
    const branch = pickBranch(
      { short_read: 0.1, normal_read: 0.9 },
      0.95,
    );
    expect(branch).toBe("normal_read");
  });

  it("allows forced click when target skip disabled", () => {
    const persona = loadPersonas().find((entry) => entry.id === "deep_researcher")!;
    expect(shouldClickTarget(persona, generateSessionTraits(persona, "s1", "au_001"), false, 0.99)).toBe(
      true,
    );
  });
});
