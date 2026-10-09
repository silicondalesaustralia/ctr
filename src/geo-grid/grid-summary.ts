import type { GeoGridPoint } from "@prisma/client";
import { prisma } from "../db/client.js";
import { NOT_FOUND_GRID_RANK } from "./grid-points.js";

export interface GridSummary {
  inPackCount: number;
  foundCount: number;
  avgRank: number | null;
}

export function summariseGridPoints(points: Pick<GeoGridPoint, "status" | "position" | "source">[]): GridSummary {
  const settled = points.filter((point) => point.status === "captured" || point.status === "not_found");
  const found = settled.filter((point) => point.status === "captured" && point.position != null);
  const inPack = found.filter((point) => point.source === "local_pack");
  const ranks = settled.map((point) =>
    point.status === "captured" && point.position != null
      ? Math.min(point.position, NOT_FOUND_GRID_RANK)
      : NOT_FOUND_GRID_RANK,
  );
  const avgRank = ranks.length > 0 ? Number((ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1)) : null;
  return { inPackCount: inPack.length, foundCount: found.length, avgRank };
}

/** Stamp the summary; complete when every point settled, else partial. */
export async function finaliseGridScan(scanId: string, final: boolean): Promise<void> {
  const points = await prisma.geoGridPoint.findMany({ where: { scanId } });
  const open = points.filter((point) => point.status === "pending" || point.status === "running");
  if (open.length > 0 && !final) return;
  if (open.length > 0) {
    await prisma.geoGridPoint.updateMany({
      where: { scanId, status: { in: ["pending", "running"] } },
      data: { status: "error" },
    });
  }
  const mobileChecked = points.filter((point) => point.mobileCheckedAt !== null);
  await prisma.geoGridScan.update({
    where: { id: scanId },
    data: {
      ...summariseGridPoints(points),
      mobileInPackCount:
        mobileChecked.length > 0 ? mobileChecked.filter((point) => point.mobilePackPosition !== null).length : null,
      status: open.length > 0 ? "partial" : "complete",
      completedAt: new Date(),
    },
  });
}
