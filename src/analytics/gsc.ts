import { readFileSync } from "node:fs";
import { parse as parseCsv } from "yaml";
import { prisma } from "../db/client.js";

export interface GscRow {
  date: string;
  query: string;
  page: string;
  country?: string;
  device?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function parseGscContent(content: string): GscRow[] {
  if (content.trim().startsWith("{") || content.trim().startsWith("-")) {
    const parsed = parseCsv(content) as GscRow[] | GscRow;
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  const lines = content.trim().split("\n");
  const headers = lines[0]?.split(",").map((h) => h.trim()) ?? [];
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return {
      date: row.date ?? row.Date ?? "",
      query: row.query ?? row.Query ?? "",
      page: row.page ?? row.Page ?? "",
      country: row.country ?? row.Country ?? "AU",
      device: row.device ?? row.Device ?? "",
      clicks: Number(row.clicks ?? row.Clicks ?? 0),
      impressions: Number(row.impressions ?? row.Impressions ?? 0),
      ctr: Number(row.ctr ?? row.CTR ?? 0),
      position: Number(row.position ?? row.Position ?? 0),
    };
  });
}

export async function importGscFile(
  experimentId: string,
  filePath: string,
): Promise<number> {
  const content = readFileSync(filePath, "utf8");
  const rows = parseGscContent(content);
  let imported = 0;

  for (const row of rows) {
    if (!row.date || !row.query || !row.page) continue;
    await prisma.rankingSnapshot.upsert({
      where: {
        experimentId_date_query_page_country_device_source: {
          experimentId,
          date: new Date(row.date),
          query: row.query,
          page: row.page,
          country: row.country ?? "AU",
          device: row.device ?? "",
          source: "gsc",
        },
      },
      update: {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      },
      create: {
        experimentId,
        date: new Date(row.date),
        query: row.query,
        page: row.page,
        country: row.country ?? "AU",
        device: row.device ?? "",
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        source: "gsc",
      },
    });
    imported += 1;
  }

  return imported;
}

export async function fetchGscViaApi(
  _experimentId: string,
  _startDate: string,
  _endDate: string,
): Promise<number> {
  throw new Error(
    "GSC API import requires configured OAuth credentials. Use file import or configure GSC_CLIENT_ID/GSC_CLIENT_SECRET/GSC_REFRESH_TOKEN.",
  );
}
