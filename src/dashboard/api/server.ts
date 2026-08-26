import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { getEnv, isRunnerEnabled, isValidDashboardPassword } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import { generateExperimentReport, analyseExperiment } from "../../analytics/report.js";
import { importGscFile } from "../../analytics/gsc.js";
import { processScheduledSession } from "../../scheduler/worker.js";
import { shouldRetry } from "../../scheduler/retry-policy.js";
import {
  createExperimentFromInput,
  type CreateExperimentInput,
} from "../../experiments/experiment-service.js";
import {
  generateQueryCluster,
  listRegionOptions,
} from "../../experiments/query-generator.js";
import {
  createIdentitiesForCampaign,
  getCampaignLog,
  getCurrentCampaign,
  getCampaignKeyword,
  previewCampaignIntensity,
  runCampaign,
  serializeCampaign,
  serializeLogEntry,
  stopCampaign,
  upsertCampaign,
  type UpsertCampaignInput,
} from "../../experiments/campaign-service.js";
import { buildCampaignProposal } from "../../campaign/campaign-proposal.js";
import { recalculateCampaignPacing } from "../../campaign/adaptive-pacing.js";
import { createAdditionalIdentities } from "../../identities/identity-service.js";
import type { Session } from "@prisma/client";

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const credential = req.header("x-api-key")?.trim();
  if (isValidDashboardPassword(credential)) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}

async function isRunnerEnabledSetting(): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({ where: { key: "runner_enabled" } });
  return setting?.value !== "false" && isRunnerEnabled();
}

export function createApiServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      runnerEnabled: isRunnerEnabled(),
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      features: ["campaign-analyze"],
    });
  });

  app.post("/auth/verify", (req, res) => {
    const body = req.body as { password?: string; apiKey?: string };
    const credential = (body.password ?? body.apiKey)?.trim();
    if (isValidDashboardPassword(credential)) {
      res.json({ ok: true });
      return;
    }
    res.status(401).json({ error: "Incorrect password" });
  });

  app.use(authMiddleware);

  app.get("/settings/runner", async (_req, res) => {
    res.json({ enabled: await isRunnerEnabledSetting() });
  });

  app.put("/settings/runner", async (req, res) => {
    const enabled = Boolean(req.body.enabled);
    await prisma.appSetting.upsert({
      where: { key: "runner_enabled" },
      update: { value: String(enabled) },
      create: { key: "runner_enabled", value: String(enabled) },
    });
    process.env.EXPERIMENT_RUNNER_ENABLED = enabled ? "true" : "false";
    res.json({ enabled });
  });

  app.get("/experiments", async (_req, res) => {
    const experiments = await prisma.experiment.findMany({
      include: {
        queries: true,
        _count: { select: { sessions: true, scheduledSessions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(experiments);
  });

  app.get("/regions", (_req, res) => {
    res.json([
      { code: "ALL", label: "All Australia", city: "Mixed" },
      ...listRegionOptions(),
    ]);
  });

  app.get("/campaign", async (_req, res) => {
    const campaign = await getCurrentCampaign();
    if (!campaign) {
      res.json({ campaign: null, running: false });
      return;
    }

    let intensity = null;
    try {
      intensity = await previewCampaignIntensity(
        {
          keyword: getCampaignKeyword(campaign),
          targetUrl: campaign.targetUrl,
          region: campaign.focusRegion ?? "ALL",
          campaignDurationDays: campaign.campaignDurationDays,
          treatmentIntensity: campaign.treatmentIntensity,
          adaptivePacing: campaign.adaptivePacing,
          recalculateEveryDays: campaign.recalculateEveryDays,
          maxShareOfSearchDemand: campaign.maxShareOfSearchDemand,
          maxShareOfGscImpressions: campaign.maxShareOfGscImpressions,
          desktopPercent: campaign.desktopPercent,
          ctrSource: campaign.ctrSource,
          queries: campaign.queries.map((q) => ({
            text: q.query,
            type: q.queryType,
            weight: q.weight,
            monthlySearchVolume: q.monthlySearchVolume,
            startingPosition: q.startingPosition,
            gscImpressions28d: q.gscImpressions28d,
            gscClicks28d: q.gscClicks28d,
          })),
        },
        campaign.id,
      );
    } catch {
      intensity = null;
    }

    res.json({
      campaign: serializeCampaign(campaign, intensity),
      running: campaign.status === "active" && (await isRunnerEnabledSetting()),
    });
  });

  app.put("/campaign", async (req, res) => {
    const body = req.body as Partial<UpsertCampaignInput>;
    if (!body.keyword?.trim() || !body.targetUrl?.trim() || !body.region?.trim()) {
      res.status(400).json({ error: "keyword, targetUrl, and region are required" });
      return;
    }

    try {
      new URL(body.targetUrl);
    } catch {
      res.status(400).json({ error: "targetUrl must be a valid URL" });
      return;
    }

    try {
      const result = await upsertCampaign(body as UpsertCampaignInput);
      res.json({
        campaign: serializeCampaign({ ...result.experiment, queries: result.queries }, result.intensity),
        running: result.experiment.status === "active",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.post("/campaign/analyze", async (req, res) => {
    const body = req.body as { keyword?: string; targetUrl?: string; region?: string };
    if (!body.keyword?.trim() || !body.targetUrl?.trim() || !body.region?.trim()) {
      res.status(400).json({ error: "keyword, targetUrl, and region are required" });
      return;
    }

    try {
      new URL(body.targetUrl);
    } catch {
      res.status(400).json({ error: "targetUrl must be a valid URL" });
      return;
    }

    try {
      const proposal = await buildCampaignProposal({
        keyword: body.keyword,
        targetUrl: body.targetUrl,
        region: body.region,
      });
      res.json({ proposal });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.post("/campaign/preview-intensity", async (req, res) => {
    const body = req.body as Partial<UpsertCampaignInput>;
    if (!body.keyword?.trim() || !body.targetUrl?.trim() || !body.region?.trim()) {
      res.status(400).json({ error: "keyword, targetUrl, and region are required" });
      return;
    }

    try {
      const current = await getCurrentCampaign();
      const intensity = await previewCampaignIntensity(body as UpsertCampaignInput, current?.id);
      res.json({ intensity });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.post("/campaign/recalculate-pacing", async (_req, res) => {
    const current = await getCurrentCampaign();
    if (!current) {
      res.status(400).json({ error: "No campaign to recalculate" });
      return;
    }

    try {
      const result = await recalculateCampaignPacing(current.id, { regenerateSchedule: true });
      const campaign = await getCurrentCampaign();
      res.json({
        intensity: result.intensity,
        rescheduled: result.updated,
        campaign: campaign ? serializeCampaign(campaign, result.intensity) : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.post("/campaign/run", async (_req, res) => {
    const current = await getCurrentCampaign();
    if (!current) {
      res.status(400).json({ error: "Save a campaign first" });
      return;
    }

    const campaign = await runCampaign(current.id);
    res.json({
      campaign: serializeCampaign(campaign),
      running: true,
    });
  });

  app.post("/campaign/stop", async (_req, res) => {
    const current = await getCurrentCampaign();
    if (!current) {
      res.status(400).json({ error: "No campaign to stop" });
      return;
    }

    const campaign = await stopCampaign(current.id);
    res.json({
      campaign: serializeCampaign(campaign),
      running: false,
    });
  });

  app.get("/campaign/log", async (_req, res) => {
    const current = await getCurrentCampaign();
    if (!current) {
      res.json({ entries: [] });
      return;
    }

    const sessions = await getCampaignLog(current.id);
    res.json({
      entries: sessions.map((session) => serializeLogEntry(session)),
    });
  });

  app.post("/experiments/preview-queries", (req, res) => {
    const { keyword, region } = req.body as { keyword?: string; region?: string };
    if (!keyword?.trim()) {
      res.status(400).json({ error: "keyword is required" });
      return;
    }

    try {
      const queries = generateQueryCluster(keyword, region ?? "ALL");
      res.json({ queries });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.post("/experiments", async (req, res) => {
    const body = req.body as Partial<CreateExperimentInput>;
    if (!body.keyword?.trim() || !body.targetUrl?.trim() || !body.region?.trim()) {
      res.status(400).json({ error: "keyword, targetUrl, and region are required" });
      return;
    }

    try {
      new URL(body.targetUrl);
    } catch {
      res.status(400).json({ error: "targetUrl must be a valid URL" });
      return;
    }

    try {
      const result = await createExperimentFromInput({
        keyword: body.keyword,
        targetUrl: body.targetUrl,
        region: body.region,
        name: body.name,
        sessionsPerMonth: body.sessionsPerMonth,
        activate: body.activate ?? false,
      });
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.get("/experiments/:id", async (req, res) => {
    const experiment = await prisma.experiment.findUnique({
      where: { id: req.params.id },
      include: {
        queries: true,
        sessions: { take: 20, orderBy: { createdAt: "desc" } },
        scheduledSessions: { where: { status: "scheduled" }, take: 20 },
      },
    });
    if (!experiment) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(experiment);
  });

  app.post("/experiments/:id/pause", async (req, res) => {
    const experiment = await prisma.experiment.update({
      where: { id: req.params.id },
      data: { status: "paused" },
    });
    res.json(experiment);
  });

  app.post("/experiments/:id/resume", async (req, res) => {
    const experiment = await prisma.experiment.update({
      where: { id: req.params.id },
      data: { status: "active" },
    });
    res.json(experiment);
  });

  app.post("/experiments/:id/cancel-future", async (req, res) => {
    const result = await prisma.scheduledSession.updateMany({
      where: { experimentId: req.params.id, status: "scheduled" },
      data: { status: "cancelled" },
    });
    res.json({ cancelled: result.count });
  });

  app.get("/experiments/:id/analysis", async (req, res) => {
    const analysis = await analyseExperiment(req.params.id!);
    res.json(analysis);
  });

  app.get("/experiments/:id/report", async (req, res) => {
    const report = await generateExperimentReport(req.params.id!);
    res.type("text/markdown").send(report);
  });

  app.get("/sessions", async (req, res) => {
    const experimentId = req.query.experimentId as string | undefined;
    const sessions = await prisma.session.findMany({
      where: experimentId ? { experimentId } : undefined,
      include: { identity: true, experiment: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(sessions);
  });

  app.get("/sessions/:id", async (req, res) => {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: { events: { orderBy: { timestamp: "asc" } }, identity: true, experiment: true },
    });
    if (!session) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(session);
  });

  app.get("/sessions/export.csv", async (req, res) => {
    const experimentId = req.query.experimentId as string | undefined;
    const sessions = await prisma.session.findMany({
      where: experimentId ? { experimentId } : undefined,
      include: { identity: true },
      orderBy: { createdAt: "desc" },
    });

    const header = [
      "id",
      "timestamp",
      "identity",
      "region",
      "device",
      "query",
      "serp_position",
      "clicked",
      "duration",
      "scroll_depth",
      "internal_clicks",
      "status",
      "bytes_transferred",
    ].join(",");

    const rows = sessions.map((s: Session & { identity: { externalId: string; region: string; deviceClass: string } }) =>
      [
        s.id,
        s.createdAt.toISOString(),
        s.identity.externalId,
        s.identity.region,
        s.identity.deviceClass,
        `"${s.queryText.replace(/"/g, '""')}"`,
        s.observedPosition ?? "",
        s.targetClicked ?? false,
        s.durationSeconds,
        s.scrollDepth,
        s.internalClicks,
        s.status,
        s.bytesTransferred.toString(),
      ].join(","),
    );

    res.type("text/csv").send([header, ...rows].join("\n"));
  });

  app.post("/sessions/:id/retry", async (req, res) => {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: { scheduledSession: true },
    });
    if (!session?.scheduledSessionId || !session.scheduledSession) {
      res.status(400).json({ error: "Session is not linked to a scheduled session" });
      return;
    }
    if (!shouldRetry(session.status, session.scheduledSession.attemptCount)) {
      res.status(400).json({ error: "Session status is not eligible for retry" });
      return;
    }
    await processScheduledSession(session.scheduledSessionId);
    res.json({ ok: true });
  });

  app.post("/campaign/create-identities", async (req, res) => {
    const body = req.body as Partial<UpsertCampaignInput> & { count?: number };
    if (!body.keyword?.trim() || !body.targetUrl?.trim() || !body.region?.trim()) {
      res.status(400).json({ error: "keyword, targetUrl, and region are required" });
      return;
    }

    try {
      const result = await createIdentitiesForCampaign(body as UpsertCampaignInput, {
        count: body.count,
      });

      if (result.createdCount === 0) {
        res.json({
          message: "No additional identities needed for this campaign plan",
          createdCount: 0,
          intensity: result.intensity,
        });
        return;
      }

      res.json({
        message: `Created ${result.createdCount} identities (${result.fromExternalId}–${result.toExternalId})`,
        createdCount: result.createdCount,
        fromExternalId: result.fromExternalId,
        toExternalId: result.toExternalId,
        intensity: result.intensity,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.post("/identities/create", async (req, res) => {
    const body = req.body as { count?: number; desktopPercent?: number };
    const count = body.count ?? 1;

    try {
      const result = await createAdditionalIdentities({
        count,
        desktopPercent: body.desktopPercent,
      });
      res.json({
        createdCount: result.created.length,
        fromExternalId: result.fromExternalId,
        toExternalId: result.toExternalId,
        identities: result.created.map((identity) => ({
          id: identity.id,
          externalId: identity.externalId,
          region: identity.region,
          deviceClass: identity.deviceClass,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.get("/identities", async (_req, res) => {
    const identities = await prisma.identity.findMany({ orderBy: { externalId: "asc" } });
    res.json(identities);
  });

  app.post("/identities/:id/disable", async (req, res) => {
    const identity = await prisma.identity.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json(identity);
  });

  app.post("/identities/:id/enable", async (req, res) => {
    const identity = await prisma.identity.update({
      where: { id: req.params.id },
      data: { active: true },
    });
    res.json(identity);
  });

  app.post("/gsc/import", async (req, res) => {
    const { experimentId, filePath } = req.body as { experimentId?: string; filePath?: string };
    if (!experimentId || !filePath) {
      res.status(400).json({ error: "experimentId and filePath are required" });
      return;
    }
    const imported = await importGscFile(experimentId, filePath);
    res.json({ imported });
  });

  app.get("/bandwidth/:experimentId", async (req, res) => {
    const sessions = await prisma.session.findMany({
      where: { experimentId: req.params.experimentId, status: "completed" },
      select: { bytesTransferred: true },
    });
    const totalBytes = sessions.reduce(
      (sum: number, s: { bytesTransferred: bigint }) => sum + Number(s.bytesTransferred),
      0,
    );
    const avgBytes = sessions.length ? totalBytes / sessions.length : 0;
    const experiment = await prisma.experiment.findUnique({ where: { id: req.params.experimentId } });
    const projected = (experiment?.monthlySessionTarget ?? 300) * avgBytes;
    res.json({
      completedSessions: sessions.length,
      dataTransferredGb: totalBytes / (1024 ** 3),
      averageBytesPerSession: avgBytes,
      projectedMonthlyGb: projected / (1024 ** 3),
    });
  });

  return app;
}

export function startApiServer(): void {
  const app = createApiServer();
  const port = getEnv().API_PORT;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Admin API listening on http://0.0.0.0:${port}`);
  });
}

const isMain = process.argv[1]?.includes("server.ts");
if (isMain) {
  startApiServer();
}
