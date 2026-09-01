import type { Identity, WarmupSessionKind, WarmupStatus } from "@prisma/client";
import { prisma } from "../db/client.js";
import {
  pickBenignWarmupQuery,
  pickGraduationQuery,
  WARMUP_BENIGN_RETRY_HOURS,
  WARMUP_BENIGN_SITE_CLICKS,
  WARMUP_GRADUATION_RETRY_HOURS,
  WARMUP_MIN_DAYS,
  WARMUP_SPREAD_DAYS,
} from "./warmup-config.js";
import {
  addMinutes,
  addCalendarDays,
  getCalendarDateInTimezone,
  randomBetween,
  randomTimeInTimezoneWindow,
} from "../utils/helpers.js";

export interface WarmupProgress {
  status: WarmupStatus;
  sessionsCompleted: number;
  siteClicks: number;
  graduationPassed: boolean;
  ageDays: number;
  minDays: number;
  minSessions: number;
  minSiteClicks: number;
  eligible: boolean;
  eligibleAt: string | null;
  scheduledRemaining: number;
}

export interface WarmupSessionOutcome {
  kind: WarmupSessionKind;
  blocked: boolean;
  siteClicked: boolean;
  queryText: string;
}

export function computeWarmupProgress(identity: Identity, scheduledRemaining = 0): WarmupProgress {
  const ageMs = Date.now() - identity.createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const eligible =
    identity.warmupStatus === "eligible" ||
    (ageDays >= WARMUP_MIN_DAYS &&
      identity.warmupSiteClicks >= WARMUP_BENIGN_SITE_CLICKS &&
      identity.warmupGraduationPassed);

  return {
    status: eligible ? "eligible" : identity.warmupStatus,
    sessionsCompleted: identity.warmupSessionsCompleted,
    siteClicks: identity.warmupSiteClicks,
    graduationPassed: identity.warmupGraduationPassed,
    ageDays: Math.round(ageDays * 10) / 10,
    minDays: WARMUP_MIN_DAYS,
    minSessions: WARMUP_BENIGN_SITE_CLICKS + 1,
    minSiteClicks: WARMUP_BENIGN_SITE_CLICKS,
    eligible,
    eligibleAt: identity.warmupEligibleAt?.toISOString() ?? null,
    scheduledRemaining,
  };
}

export function isWarmupEligible(identity: Identity): boolean {
  return computeWarmupProgress(identity).eligible;
}

export function identityAllowedForCampaign(
  identity: Identity,
  requireWarmup: boolean,
): boolean {
  if (!identity.active) return false;
  if (!requireWarmup) return true;
  return isWarmupEligible(identity);
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

export async function scheduleWarmupRetry(
  identityId: string,
  kind: WarmupSessionKind,
  queryText: string,
): Promise<void> {
  const delayHours = kind === "graduation" ? WARMUP_GRADUATION_RETRY_HOURS : WARMUP_BENIGN_RETRY_HOURS;
  await prisma.warmupSession.create({
    data: {
      identityId,
      queryText,
      kind,
      scheduledAt: addMinutes(new Date(), delayHours * 60),
    },
  });
}

export async function recordWarmupSessionResult(
  identityId: string,
  outcome: WarmupSessionOutcome,
): Promise<Identity> {
  if (outcome.blocked) {
    await prisma.identity.update({
      where: { id: identityId },
      data: {
        blockedSessions: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
    await scheduleWarmupRetry(identityId, outcome.kind, outcome.queryText);
    return prisma.identity.findUniqueOrThrow({ where: { id: identityId } });
  }

  if (outcome.kind === "graduation") {
    const updated = await prisma.identity.update({
      where: { id: identityId },
      data: {
        warmupGraduationPassed: true,
        warmupSessionsCompleted: { increment: 1 },
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

  if (!outcome.siteClicked) {
    await scheduleWarmupRetry(identityId, "benign", outcome.queryText);
    return prisma.identity.findUniqueOrThrow({ where: { id: identityId } });
  }

  const updated = await prisma.identity.update({
    where: { id: identityId },
    data: {
      warmupSessionsCompleted: { increment: 1 },
      warmupSiteClicks: { increment: 1 },
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

function benignSessionsNeeded(identity: Identity): number {
  return Math.max(0, WARMUP_BENIGN_SITE_CLICKS - identity.warmupSiteClicks);
}

function scheduleWarmupRows(identity: Identity, now = new Date()) {
  const rows: Array<{
    identityId: string;
    queryText: string;
    kind: WarmupSessionKind;
    scheduledAt: Date;
  }> = [];

  const benignNeeded = benignSessionsNeeded(identity);
  const graduationNeeded = !identity.warmupGraduationPassed;
  const totalSlots = benignNeeded + (graduationNeeded ? 1 : 0);

  if (totalSlots === 0) {
    return rows;
  }

  for (let slot = 0; slot < totalSlots; slot += 1) {
    const dayOffset = Math.min(
      WARMUP_SPREAD_DAYS - 1,
      Math.floor((slot / Math.max(totalSlots - 1, 1)) * (WARMUP_SPREAD_DAYS - 1)),
    );
    const baseCalendar = getCalendarDateInTimezone(now, identity.timezone);
    const dayCalendar = addCalendarDays(baseCalendar, dayOffset);

    let scheduledAt = randomTimeInTimezoneWindow(dayCalendar, "07:00", "22:00", identity.timezone);
    if (scheduledAt <= now) {
      scheduledAt = addMinutes(now, randomBetween(30, 180) + slot * randomBetween(120, 240));
    }

    const isGraduationSlot = graduationNeeded && slot === totalSlots - 1;
    rows.push({
      identityId: identity.id,
      queryText: isGraduationSlot
        ? pickGraduationQuery(identity.externalId, identity.city)
        : pickBenignWarmupQuery(identity.city, identity.warmupSiteClicks + slot),
      kind: isGraduationSlot ? "graduation" : "benign",
      scheduledAt,
    });
  }

  rows.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  return rows;
}

export async function scheduleWarmupForIdentity(identity: Identity): Promise<number> {
  const pending = await prisma.warmupSession.count({
    where: { identityId: identity.id, status: "scheduled" },
  });
  if (pending > 0) {
    return 0;
  }

  const rows = scheduleWarmupRows(identity);
  if (rows.length === 0) {
    return 0;
  }

  await prisma.warmupSession.createMany({ data: rows });
  return rows.length;
}

export async function rebuildWarmupSchedule(identity: Identity): Promise<number> {
  await cancelPendingWarmupSessions(identity.id);
  return scheduleWarmupForIdentity(identity);
}

export async function countEligibleIdentities(
  region?: string | null,
  requireWarmup = true,
  city?: string | null,
): Promise<number> {
  const identities = await prisma.identity.findMany({
    where: {
      active: true,
      ...(city?.trim() ? { city: city.trim() } : {}),
      ...(!city?.trim() && region && region !== "ALL" ? { region } : {}),
    },
  });

  return identities.filter((identity) => identityAllowedForCampaign(identity, requireWarmup))
    .length;
}

export async function getCampaignIdentityPool(
  experimentId: string,
  focusRegion?: string | null,
  focusCity?: string | null,
): Promise<Identity[]> {
  const experiment = await prisma.experiment.findUniqueOrThrow({
    where: { id: experimentId },
    select: { requireWarmupIdentities: true },
  });
  const requireWarmup = experiment.requireWarmupIdentities;

  const selections = await prisma.experimentIdentity.findMany({
    where: { experimentId, selected: true },
    include: { identity: true },
  });

  if (selections.length > 0) {
    return selections
      .map((row) => row.identity)
      .filter((identity) => identityAllowedForCampaign(identity, requireWarmup));
  }

  const identities = await prisma.identity.findMany({
    where: {
      active: true,
      ...(focusCity?.trim() ? { city: focusCity.trim() } : {}),
      ...(!focusCity?.trim() && focusRegion && focusRegion !== "ALL"
        ? { region: focusRegion }
        : {}),
    },
  });

  return identities.filter((identity) => identityAllowedForCampaign(identity, requireWarmup));
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
    scheduled += await rebuildWarmupSchedule(identity);
  }

  return scheduled;
}

/** Grandfather active/paused campaigns so they can keep using cold identities. */
export async function backfillCampaignWarmupRequirements(): Promise<number> {
  const result = await prisma.experiment.updateMany({
    where: {
      status: { in: ["active", "paused"] },
      slug: { not: "__warmup__" },
    },
    data: { requireWarmupIdentities: false },
  });
  return result.count;
}
