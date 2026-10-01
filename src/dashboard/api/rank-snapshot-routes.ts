import type { Express } from "express";
import { prisma } from "../../db/client.js";
import { enqueueSnapshotJob } from "../../rank-snapshots/snapshot-queue.js";
import { queueManualSnapshots } from "../../rank-snapshots/snapshot-triggers.js";
import { listSessionSnapshotRows, sessionIdFromSnapshotId } from "./session-snapshot-rows.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerRankSnapshotRoutes(app: Express): void {
  app.get("/campaigns/:id/rank-snapshots", async (req, res) => {
    try {
      const where = { experimentId: req.params.id };
      const [rows, withImage, sessionRows] = await Promise.all([
        prisma.rankSnapshot.findMany({
          where,
          orderBy: [{ localDate: "desc" }, { createdAt: "desc" }],
          omit: { imageJpeg: true },
        }),
        prisma.rankSnapshot.findMany({
          where: { ...where, imageJpeg: { not: null } },
          select: { id: true },
        }),
        listSessionSnapshotRows(req.params.id),
      ]);
      const hasImage = new Set(withImage.map((row) => row.id));
      const merged = [...rows.map((row) => ({ ...row, hasImage: hasImage.has(row.id) })), ...sessionRows];
      merged.sort(
        (a, b) => b.localDate.localeCompare(a.localDate) || b.createdAt.getTime() - a.createdAt.getTime(),
      );
      res.json(merged);
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  // JSON + base64: the dashboard proxy forwards response bodies as text.
  app.get("/rank-snapshots/:id/image", async (req, res) => {
    try {
      const sessionId = sessionIdFromSnapshotId(req.params.id);
      const row = sessionId
        ? await prisma.sessionSnapshot.findUnique({ where: { sessionId }, select: { imageJpeg: true } })
        : await prisma.rankSnapshot.findUnique({ where: { id: req.params.id }, select: { imageJpeg: true } });
      if (!row?.imageJpeg) {
        res.status(404).json({ error: "No image for this snapshot" });
        return;
      }
      res.json({ imageBase64: Buffer.from(row.imageJpeg).toString("base64") });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.post("/campaigns/:id/rank-snapshots", async (req, res) => {
    try {
      const queued = await queueManualSnapshots(req.params.id);
      await enqueueSnapshotJob(req.params.id);
      res.json({ queued });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });
}
