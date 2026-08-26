import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { getEnv, isRunnerEnabled } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import { generateExperimentReport, analyseExperiment } from "../../analytics/report.js";
import { importGscFile } from "../../analytics/gsc.js";
import { processScheduledSession } from "../../scheduler/worker.js";
import { shouldRetry } from "../../scheduler/retry-policy.js";
import type { Session } from "@prisma/client";

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.header("x-api-key");
  if (apiKey !== getEnv().ADMIN_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function createApiServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(authMiddleware);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, runnerEnabled: isRunnerEnabled() });
  });

  app.get("/settings/runner", async (_req, res) => {
    const setting = await prisma.appSetting.findUnique({ where: { key: "runner_enabled" } });
    res.json({ enabled: setting?.value !== "false" && isRunnerEnabled() });
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
  app.listen(port, () => {
    console.log(`Admin API listening on http://localhost:${port}`);
  });
}

const isMain = process.argv[1]?.includes("server.ts");
if (isMain) {
  startApiServer();
}
