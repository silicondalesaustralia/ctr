import type { Express } from "express";
import type { RankSnapshot } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { isNationalCampaign, panelCities } from "../../rank-snapshots/national-panel.js";

type PanelRow = Pick<RankSnapshot, "panelCity" | "kind" | "status" | "position" | "source" | "localDate">;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rankOf(row: PanelRow | undefined) {
  return row ? { position: row.position, source: row.source, localDate: row.localDate, status: row.status } : null;
}

function averageFound(rows: (PanelRow | undefined)[]): number | null {
  const found = rows.flatMap((row) => (row?.status === "captured" && row.position != null ? [row.position] : []));
  return found.length > 0 ? Number((found.reduce((a, b) => a + b, 0) / found.length).toFixed(1)) : null;
}

export function registerNationalPanelRoutes(app: Express): void {
  /** Latest and baseline rank per panel city for one keyword (national URL campaigns). */
  app.get("/campaigns/:id/national-panel", async (req, res) => {
    try {
      const experiment = await prisma.experiment.findUnique({ where: { id: req.params.id } });
      if (!experiment) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }
      const keyword = typeof req.query.keyword === "string" ? req.query.keyword : "";
      if (!isNationalCampaign(experiment) || !keyword) {
        res.json({ national: false, cities: [], average: null });
        return;
      }
      const rows = await prisma.rankSnapshot.findMany({
        where: {
          experimentId: experiment.id,
          query: keyword,
          panelCity: { not: "" },
          status: { in: ["captured", "not_found"] },
        },
        orderBy: [{ localDate: "desc" }, { capturedAt: "desc" }],
        select: { panelCity: true, kind: true, status: true, position: true, source: true, localDate: true },
      });
      const cities = panelCities(experiment.country).map((city) => {
        const cityRows = rows.filter((row) => row.panelCity === city.city);
        const latest = cityRows[0];
        const baseline = cityRows.find((row) => row.kind === "baseline");
        return { city: city.city, latitude: city.latitude, longitude: city.longitude, latest, baseline };
      });
      const latestRows = cities.map((city) => city.latest);
      res.json({
        national: true,
        cities: cities.map((city) => ({ ...city, latest: rankOf(city.latest), baseline: rankOf(city.baseline) })),
        average: {
          latest: averageFound(latestRows),
          baseline: averageFound(cities.map((city) => city.baseline)),
          found: latestRows.filter((row) => row?.status === "captured").length,
          total: cities.length,
        },
      });
    } catch (error) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });
}
