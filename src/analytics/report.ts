import { prisma } from "../db/client.js";
import { buildClusterMetrics } from "./cluster-analysis.js";
import {
  aggregateQueryMetrics,
  buildExperimentWindows,
  interpretEffect,
  weightedClusterAverage,
} from "./ranking-analysis.js";
import { calculateDifferenceInDifferences } from "./control-analysis.js";

export async function analyseExperiment(experimentId: string) {
  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: { queries: true, sessions: true },
  });

  if (!experiment) {
    throw new Error(`Experiment not found: ${experimentId}`);
  }

  const snapshots = await prisma.rankingSnapshot.findMany({
    where: { experimentId },
    orderBy: { date: "asc" },
  });

  const { baselineEnd, treatmentEnd } = buildExperimentWindows(experiment);
  const queryMetrics = aggregateQueryMetrics(snapshots, baselineEnd, treatmentEnd);
  const weights = Object.fromEntries(
    experiment.queries.map((q) => [q.query, q.weight]),
  );

  const treatedQueries = experiment.queries.map((q) => q.query);
  const clusterAverage = weightedClusterAverage(queryMetrics, weights);
  const cluster = buildClusterMetrics(queryMetrics, treatedQueries, []);

  const completedSessions = experiment.sessions.filter((s) => s.status === "completed").length;
  const blockedSessions = experiment.sessions.filter((s) => s.status === "blocked").length;
  const targetNotFound = experiment.sessions.filter((s) => s.status === "target_not_found").length;

  const avgDwell =
    experiment.sessions.reduce((sum, s) => sum + s.durationSeconds, 0) /
    Math.max(experiment.sessions.length, 1);
  const avgScroll =
    experiment.sessions.reduce((sum, s) => sum + s.scrollDepth, 0) /
    Math.max(experiment.sessions.length, 1);

  const coreMetric = queryMetrics[0];
  const controlComparison = calculateDifferenceInDifferences({
    targetBaseline: coreMetric?.baselinePosition ?? 0,
    targetTreatment: coreMetric?.treatmentPosition ?? 0,
    controlBaseline: coreMetric?.baselinePosition ?? 0,
    controlTreatment: coreMetric?.baselinePosition ?? 0,
  });

  const interpretation = interpretEffect(
    coreMetric?.positionDelta ?? 0,
    controlComparison.controlImprovement,
  );

  return {
    experiment: {
      id: experiment.id,
      name: experiment.name,
      slug: experiment.slug,
      targetUrl: experiment.targetUrl,
    },
    traffic: {
      planned: experiment.monthlySessionTarget,
      completed: completedSessions,
      blocked: blockedSessions,
      targetNotFound,
      averageDwell: avgDwell,
      averageScrollDepth: avgScroll,
      internalNavigationRate:
        experiment.sessions.filter((s) => s.internalClicks > 0).length /
        Math.max(experiment.sessions.length, 1),
    },
    searchOutcomes: queryMetrics,
    cluster: {
      averagePosition: clusterAverage,
      treated: cluster.treated,
      untreatedMovement: cluster.untreatedMovement,
    },
    controls: controlComparison,
    interpretation,
  };
}

export async function generateExperimentReport(experimentId: string): Promise<string> {
  const analysis = await analyseExperiment(experimentId);
  const lines = [
    "# Experiment Report",
    "",
    `Experiment: ${analysis.experiment.name}`,
    `Target: ${analysis.experiment.targetUrl}`,
    "",
    "## Traffic execution",
    `- Completed: ${analysis.traffic.completed}`,
    `- Blocked: ${analysis.traffic.blocked}`,
    `- Target not found: ${analysis.traffic.targetNotFound}`,
    `- Average dwell: ${analysis.traffic.averageDwell.toFixed(1)}s`,
    `- Average scroll depth: ${analysis.traffic.averageScrollDepth.toFixed(1)}%`,
    "",
    "## Search outcome",
  ];

  for (const metric of analysis.searchOutcomes) {
    lines.push(
      `- ${metric.query}: baseline ${metric.baselinePosition.toFixed(2)}, treatment ${metric.treatmentPosition.toFixed(2)}, delta ${metric.positionDelta.toFixed(2)}`,
    );
  }

  lines.push("", "## Interpretation", analysis.interpretation);
  return lines.join("\n");
}
