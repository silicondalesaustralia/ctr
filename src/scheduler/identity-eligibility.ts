import type { Identity } from "@prisma/client";
import { prisma } from "../db/client.js";
import { isWarmupEligible } from "../warmup/warmup-service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type EligibilityCheck = (identity: Identity, scheduledAt: Date) => boolean;

function dayKey(at: Date): number {
  const dayStart = new Date(at);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart.getTime();
}

/**
 * In-memory equivalent of isIdentityEligible for a whole schedule run: the per-slot
 * version issued several queries per identity per slot and timed out campaign starts.
 */
export async function buildEligibilityCheck(input: {
  experimentId: string;
  identityIds: string[];
  from: Date;
  to: Date;
  minGapDays: number;
  maxPerDay: number;
}): Promise<EligibilityCheck> {
  const [experiment, identities, existing, running] = await Promise.all([
    prisma.experiment.findUnique({
      where: { id: input.experimentId },
      select: { requireWarmupIdentities: true },
    }),
    prisma.identity.findMany({ where: { id: { in: input.identityIds } } }),
    prisma.scheduledSession.findMany({
      where: {
        identityId: { in: input.identityIds },
        scheduledAt: { gte: new Date(input.from.getTime() - DAY_MS), lt: new Date(input.to.getTime() + DAY_MS) },
        status: { not: "cancelled" },
      },
      select: { identityId: true, scheduledAt: true },
    }),
    prisma.session.findMany({
      where: { identityId: { in: input.identityIds }, status: "running" },
      select: { identityId: true },
    }),
  ]);

  const byId = new Map(identities.map((row) => [row.id, row]));
  const busy = new Set(running.map((row) => row.identityId));
  const perDay = new Map<string, number>();
  for (const row of existing) {
    const key = `${row.identityId}:${dayKey(row.scheduledAt)}`;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  return (candidate, scheduledAt) => {
    const identity = byId.get(candidate.id);
    if (!identity?.active || busy.has(identity.id)) return false;
    if (experiment?.requireWarmupIdentities && !isWarmupEligible(identity)) return false;
    if ((perDay.get(`${identity.id}:${dayKey(scheduledAt)}`) ?? 0) >= input.maxPerDay) return false;
    if (identity.lastUsedAt) {
      const gapDays = (scheduledAt.getTime() - identity.lastUsedAt.getTime()) / DAY_MS;
      if (gapDays < input.minGapDays) return false;
    }
    return true;
  };
}
