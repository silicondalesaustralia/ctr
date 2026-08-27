import type { Identity, WarmupStatus } from "@prisma/client";
import { prisma } from "../db/client.js";
import {
  pickWarmupQuery,
  WARMUP_MIN_DAYS,
  WARMUP_MIN_SESSIONS,
  WARMUP_MIN_SITE_CLICKS,
  WARMUP_SESSION_COUNT,
  WARMUP_SPREAD_DAYS,
} from "./warmup-config.js";
import { addMinutes, parseTimeToMinutes, randomBetween } from "../utils/helpers.js";

export interface WarmupProgress {
  status: WarmupStatus;
  sessionsCompleted: number;
  siteClicks: number;
  ageDays: number;
  minDays: number;
  minSessions: number;
  minSiteClicks: number;
  eligible: boolean;
  eligibleAt: string | null;
  scheduledRemaining: number;
}

export function computeWarmupProgress(identity: Identity, scheduledRemaining = 0): WarmupProgress {
  const ageMs = Date.now() - identity.createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const eligible =
    identity.warmupStatus === "eligible" ||
    (ageDays >= WARMUP_MIN_DAYS &&
      identity.warmupSessionsCompleted >= WARMUP_MIN_SESSIONS &&
      identity.warmupSiteClicks >= WARMUP_MIN_SITE_CLICKS);

  return {
    status: eligible ? "eligible" : identity.warmupStatus,
    sessionsCompleted: identity.warmupSessionsCompleted,
    siteClicks: identity.warmupSiteClicks,
    ageDays: Math.round(ageDays * 10) / 10,
    minDays: WARMUP_MIN_DAYS,
    minSessions: WARMUP_MIN_SESSIONS,
    minSiteClicks: WARMUP_MIN_SITE_CLICKS,
    eligible,
    eligibleAt: identity.warmupEligibleAt?.toISOString() ?? null,
    scheduledRemaining,
  };
}

export function isWarmupEligible(identity: Identity): boolean {
  return computeWarmupProgress(identity).eligible;
}

export async function refreshWarmupEligibility(identityId: string): Promise<Identity> {
  const identity = await prisma.identity.findUniqueOrThrow({ where: { id: identityId } });
  if (identity.warmupStatus === "eligible") {
    return identity;
  }

  if (!isWarmupEligible(identity)) {
    return identity;
  }

  return prisma.identity.update({
    where: { id: identityId },
    data: {
      warmupStatus: "eligible",
      warmupEligibleAt: identity.warmupEligibleAt ?? new Date(),
    },
  });
}

async function cancelPendingWarmupSessions(identityId: string): Promise<void> {
  await prisma.warmupSession.updateMany({
    where: { identityId, status: "scheduled" },
    data: { status: "cancelled" },
  });
}

export async function recordWarmupSessionResult(
  identityId: string,
  siteClicked: boolean,
): Promise<Identity> {
  const updated = await prisma.identity.update({
    where: { id: identityId },
    data: {
      warmupSessionsCompleted: { increment: 1 },
      warmupSiteClicks: siteClicked ? { increment: 1 } : undefined,
      totalSessions: { increment: 1 },
      googleSessions: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });

  return refreshWarmupEligibility(updated.id).then(async (identity) => {
    if (identity.warmupStatus === "eligible") {
      await cancelPendingWarmupSessions(identityId);
    }
    return identity;
  });
}

function randomWarmupTime(baseDate: Date, timezone: string): Date {
  const startMinutes = parseTimeToMinutes("07:00");
  const endMinutes = parseTimeToMinutes("22:00");
  const minute = randomBetween(startMinutes, endMinutes);
  const result = new Date(baseDate);
  result.setHours(Math.floor(minute / 60), minute % 60, randomBetween(0, 59), 0);
  void timezone;
  return result;
}

export async function scheduleWarmupForIdentity(identity: Identity): Promise<number> {
  const existing = await prisma.warmupSession.count({
    where: { identityId: identity.id, status: { not: "cancelled" } },
  });

  if (existing > 0) {
    return 0;
  }

  const now = new Date();
  const rows: Array<{ identityId: string; queryText: string; scheduledAt: Date }> = [];

  for (let i = 0; i < WARMUP_SESSION_COUNT; i += 1) {
    const dayOffset = Math.floor((i / WARMUP_SESSION_COUNT) * WARMUP_SPREAD_DAYS);
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() + dayOffset);
    dayDate.setHours(0, 0, 0, 0);

    let scheduledAt = randomWarmupTime(dayDate, identity.timezone);
    if (scheduledAt <= now) {
      scheduledAt = addMinutes(now, randomBetween(30, 180));
    }

    rows.push({
      identityId: identity.id,
      queryText: pickWarmupQuery(identity.city, i),
      scheduledAt,
    });
  }

  rows.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  await prisma.warmupSession.createMany({ data: rows });
  return rows.length;
}

export async function countEligibleIdentities(region?: string | null): Promise<number> {
  const identities = await prisma.identity.findMany({
    where: {
      active: true,
      ...(region && region !== "ALL" ? { region } : {}),
    },
  });

  return identities.filter((identity) => isWarmupEligible(identity)).length;
}

export async function getCampaignIdentityPool(
  experimentId: string,
  focusRegion?: string | null,
): Promise<Identity[]> {
  const selections = await prisma.experimentIdentity.findMany({
    where: { experimentId, selected: true },
    include: { identity: true },
  });

  if (selections.length > 0) {
    return selections
      .map((row) => row.identity)
      .filter((identity) => identity.active && isWarmupEligible(identity));
  }

  const identities = await prisma.identity.findMany({
    where: {
      active: true,
      ...(focusRegion && focusRegion !== "ALL" ? { region: focusRegion } : {}),
    },
  });

  return identities.filter((identity) => isWarmupEligible(identity));
}

export async function setCampaignIdentities(
  experimentId: string,
  identityIds: string[],
): Promise<void> {
  await prisma.experimentIdentity.deleteMany({ where: { experimentId } });

  if (identityIds.length === 0) {
    return;
  }

  await prisma.experimentIdentity.createMany({
    data: identityIds.map((identityId) => ({
      experimentId,
      identityId,
      selected: true,
    })),
  });
}

export async function backfillWarmupForExistingIdentities(): Promise<number> {
  const identities = await prisma.identity.findMany({
    where: { warmupStatus: "warming" },
    orderBy: { externalId: "asc" },
  });

  let scheduled = 0;
  for (const identity of identities) {
    if (isWarmupEligible(identity)) {
      await refreshWarmupEligibility(identity.id);
      await cancelPendingWarmupSessions(identity.id);
      continue;
    }
    scheduled += await scheduleWarmupForIdentity(identity);
  }

  return scheduled;
}
