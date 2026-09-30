import { prisma } from "../db/client.js";

/** Worker polls every 60s, so this lands the first session ~1–2 minutes after start. */
const FIRST_SESSION_DELAY_MS = 60_000;

/**
 * Move the campaign's earliest queued session to just after "now" so the user can see
 * straight away whether a session works. Ignores the daily schedule window on purpose.
 */
export async function pullFirstSessionForward(experimentId: string): Promise<Date | null> {
  const first = await prisma.scheduledSession.findFirst({
    where: { experimentId, status: "scheduled" },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, scheduledAt: true },
  });
  if (!first) return null;

  const target = new Date(Date.now() + FIRST_SESSION_DELAY_MS);
  if (first.scheduledAt <= target) return first.scheduledAt;

  await prisma.scheduledSession.update({
    where: { id: first.id },
    data: { scheduledAt: target },
  });
  return target;
}
