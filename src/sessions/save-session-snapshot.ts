import type { SearchJourneyResult } from "../behaviour/types.js";
import { prisma } from "../db/client.js";

export interface SessionSnapshotContext {
  sessionId: string;
  experimentId: string;
  fallbackQuery: string;
  egressCity?: string;
  identityExternalId: string;
}

/** Stores the pre-click screenshot; a failed save is logged and never fails the session. */
export async function saveSessionSnapshot(
  search: SearchJourneyResult,
  context: SessionSnapshotContext,
): Promise<void> {
  const view = search.rankView;
  if (!view) return;
  try {
    await prisma.sessionSnapshot.create({
      data: {
        sessionId: context.sessionId,
        experimentId: context.experimentId,
        query: search.searches.at(-1)?.queryText ?? context.fallbackQuery,
        position: search.observedPosition ?? null,
        serpPage: search.serpPage ?? null,
        source: view.source ?? null,
        resultTitle: search.resultTitle ?? null,
        pageUrl: view.pageUrl,
        egressCity: context.egressCity ?? null,
        identityExternalId: context.identityExternalId,
        imageJpeg: view.imageJpeg,
      },
    });
  } catch (error) {
    console.error(
      `[session-snapshot] save failed for ${context.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
