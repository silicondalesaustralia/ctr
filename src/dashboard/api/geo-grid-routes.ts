import type { Express } from "express";
import { prisma } from "../../db/client.js";
import { enqueueGridJob } from "../../geo-grid/grid-queue.js";
import { queueManualGridScans } from "../../geo-grid/grid-triggers.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseTopResults(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function registerGeoGridRoutes(app: Express): void {
  app.get("/campaigns/:id/geo-grids", async (req, res) => {
    try {
      const scans = await prisma.geoGridScan.findMany({
        where: { experimentId: req.params.id },
        orderBy: { createdAt: "desc" },
        omit: { centreImageJpeg: true },
        include: { _count: { select: { points: true } } },
      });
      const withImage = await prisma.geoGridScan.findMany({
        where: { experimentId: req.params.id, centreImageJpeg: { not: null } },
        select: { id: true },
      });
      const hasImage = new Set(withImage.map((row) => row.id));
      res.json(
        scans.map(({ _count, ...scan }) => ({ ...scan, pointCount: _count.points, hasImage: hasImage.has(scan.id) })),
      );
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get("/geo-grids/:id", async (req, res) => {
    try {
      const points = await prisma.geoGridPoint.findMany({
        where: { scanId: req.params.id },
        orderBy: [{ row: "asc" }, { col: "asc" }],
      });
      res.json(points.map(({ topResultsJson, ...point }) => ({ ...point, topResults: parseTopResults(topResultsJson) })));
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.get("/geo-grids/:id/image", async (req, res) => {
    try {
      const scan = await prisma.geoGridScan.findUnique({
        where: { id: req.params.id },
        select: { centreImageJpeg: true },
      });
      if (!scan?.centreImageJpeg) {
        res.status(404).json({ error: "No image for this scan" });
        return;
      }
      res.json({ imageBase64: Buffer.from(scan.centreImageJpeg).toString("base64") });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  app.post("/campaigns/:id/geo-grids", async (req, res) => {
    try {
      const queued = await queueManualGridScans(req.params.id);
      const pending = await prisma.geoGridScan.findMany({
        where: { experimentId: req.params.id, status: "pending", scheduledAt: { lte: new Date() } },
        select: { id: true },
      });
      for (const { id } of pending) await enqueueGridJob(id);
      res.json({ queued });
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  });
}
