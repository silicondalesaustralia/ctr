import { prisma } from "../../db/client.js";
import { localDateString } from "../../rank-snapshots/snapshot-triggers.js";

const SESSION_ID_PREFIX = "session-";
const MAX_SESSION_ROWS = 200;

export function sessionIdFromSnapshotId(id: string): string | null {
  return id.startsWith(SESSION_ID_PREFIX) ? id.slice(SESSION_ID_PREFIX.length) : null;
}

/** Session screenshots shaped like rank snapshot rows (kind "session") for the Snapshots tab. */
export async function listSessionSnapshotRows(experimentId: string) {
  const [experiment, rows] = await Promise.all([
    prisma.experiment.findUniqueOrThrow({
      where: { id: experimentId },
      select: { scheduleTimezone: true },
    }),
    prisma.sessionSnapshot.findMany({
      where: { experimentId },
      orderBy: { createdAt: "desc" },
      take: MAX_SESSION_ROWS,
      omit: { imageJpeg: true },
    }),
  ]);

  return rows.map((row) => ({
    id: `${SESSION_ID_PREFIX}${row.sessionId}`,
    experimentId: row.experimentId,
    query: row.query,
    kind: "session" as const,
    localDate: localDateString(row.createdAt, experiment.scheduleTimezone),
    scheduledAt: row.createdAt,
    status: row.position === null ? ("not_found" as const) : ("captured" as const),
    attemptCount: 1,
    position: row.position,
    serpPage: row.serpPage,
    source: row.source,
    resultTitle: row.resultTitle,
    pageUrl: row.pageUrl,
    egressCity: row.egressCity,
    identityExternalId: row.identityExternalId,
    errorMessage: null,
    capturedAt: row.createdAt,
    createdAt: row.createdAt,
    hasImage: true,
  }));
}
