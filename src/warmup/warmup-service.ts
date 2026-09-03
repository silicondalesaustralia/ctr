import type { Identity, WarmupSessionKind, WarmupStatus } from "@prisma/client";
import { prisma } from "../db/client.js";
import {
  pickBenignWarmupQuery,
  pickGraduationQuery,
  WARMUP_BENIGN_RETRY_HOURS,
  WARMUP_BENIGN_SITE_CLICKS,
  WARMUP_GRADUATION_RETRY_HOURS,
  WARMUP_MIN_DAYS,
  WARMUP_SESSION_GAP_MINUTES,
  WARMUP_SPREAD_DAYS,
  WARMUP_WINDOW_HOURS,
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

export type IdentityGeoScopeValue = "city" | "country";

/** Pure geo match used by campaign identity pools. */
export function identityMatchesCampaignGeo(
  identity: Pick<Identity, "city" | "region" | "country">,
  opts: {
    scope: IdentityGeoScopeValue;
    focusCity?: string | null;
    focusRegion?: string | null;
    country?: string | null;
  },
): boolean {
  if (opts.scope === "country") {
    const country = opts.country?.trim();
    return !country || identity.country === country;
  }
  if (opts.focusCity?.trim()) {
    return (identity.city ?? "").toLowerCase() === opts.focusCity.trim().toLowerCase();
  }
  if (opts.focusRegion && opts.focusRegion !== "ALL") {
    return identity.region === opts.focusRegion;
  }
  return true;
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
    let scheduledAt: Date;

    if (WARMUP_SPREAD_DAYS <= 1) {
      const leadMinutes = randomBetween(15, 35);
      const gap = randomBetween(WARMUP_SESSION_GAP_MINUTES, WARMUP_SESSION_GAP_MINUTES + 25);
      scheduledAt = addMinutes(now, leadMinutes + slot * gap);
    } else {
      const dayOffset = Math.min(
        WARMUP_SPREAD_DAYS - 1,
        Math.floor((slot / Math.max(totalSlots - 1, 1)) * (WARMUP_SPREAD_DAYS - 1)),
      );
      const baseCalendar = getCalendarDateInTimezone(now, identity.timezone);
      const dayCalendar = addCalendarDays(baseCalendar, dayOffset);

      scheduledAt = randomTimeInTimezoneWindow(dayCalendar, "07:00", "22:00", identity.timezone);
      if (scheduledAt <= now) {
        scheduledAt = addMinutes(now, randomBetween(30, 180) + slot * randomBetween(120, 240));
      }
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

/** Pack pending warmups into same-day slots for specific identities. */
export async function acceleratePendingWarmups(identityIds?: string[]): Promise<number> {
  if (!identityIds?.length) {
    return accelerateAllWarmupsInterleaved();
  }

  const now = new Date();
  const pending = await prisma.warmupSession.findMany({
    where: { status: "scheduled", identityId: { in: identityIds } },
    orderBy: [{ identityId: "asc" }, { scheduledAt: "asc" }],
  });

  let slotByIdentity = new Map<string, number>();
  let updated = 0;

  for (const session of pending) {
    const slot = slotByIdentity.get(session.identityId) ?? 0;
    slotByIdentity.set(session.identityId, slot + 1);

    const leadMinutes = randomBetween(10, 20);
    const gap = randomBetween(WARMUP_SESSION_GAP_MINUTES, WARMUP_SESSION_GAP_MINUTES + 15);
    const scheduledAt = addMinutes(now, leadMinutes + slot * gap);

    await prisma.warmupSession.update({
      where: { id: session.id },
      data: { scheduledAt },
    });
    updated += 1;
  }

  return updated;
}

/** Round-robin all pending warmups across identities over a window (default 48h). */
export async function accelerateAllWarmupsInterleaved(
  windowHours = WARMUP_WINDOW_HOURS,
): Promise<number> {
  const pending = await prisma.warmupSession.findMany({
    where: { status: "scheduled" },
    orderBy: [{ identityId: "asc" }, { scheduledAt: "asc" }],
  });

  if (pending.length === 0) return 0;

  const groups = new Map<string, typeof pending>();
  for (const session of pending) {
    const list = groups.get(session.identityId) ?? [];
    list.push(session);
    groups.set(session.identityId, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "benign" ? -1 : 1;
      return a.scheduledAt.getTime() - b.scheduledAt.getTime();
    });
  }

  const identityOrder = [...groups.keys()].sort();
  const maxRounds = Math.max(...[...groups.values()].map((list) => list.length));
  const interleaved: typeof pending = [];

  for (let round = 0; round < maxRounds; round += 1) {
    for (const identityId of identityOrder) {
      const list = groups.get(identityId)!;
      if (round < list.length) interleaved.push(list[round]!);
    }
  }

  const now = Date.now();
  const leadMs = 12 * 60 * 1000;
  const windowMs = windowHours * 60 * 60 * 1000;
  const gapMs = interleaved.length > 1 ? windowMs / interleaved.length : windowMs;

  for (let i = 0; i < interleaved.length; i += 1) {
    const jitterMs = randomBetween(-2, 2) * 60 * 1000;
    const scheduledAt = new Date(now + leadMs + i * gapMs + jitterMs);
    await prisma.warmupSession.update({
      where: { id: interleaved[i]!.id },
      data: { scheduledAt },
    });
  }

  return interleaved.length;
}

/** Rebuild missing warmups for all warming identities, interleave over windowHours. */
export async function prepareWarmupPool(windowHours = WARMUP_WINDOW_HOURS): Promise<{
  scheduled: number;
  interleaved: number;
}> {
  const scheduled = await backfillWarmupForExistingIdentities();
  const interleaved = await accelerateAllWarmupsInterleaved(windowHours);

  const identities = await prisma.identity.findMany({
    where: { warmupStatus: "warming" },
  });
  for (const identity of identities) {
    await refreshWarmupEligibility(identity.id);
  }

  return { scheduled, interleaved };
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

/** Country-wide eligible count (ignores city/region). */
export async function countEligibleIdentitiesInCountry(
  country = "AU",
  requireWarmup = true,
): Promise<number> {
  const identities = await prisma.identity.findMany({
    where: { active: true, country },
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
    select: {
      requireWarmupIdentities: true,
      identityGeoScope: true,
      focusRegion: true,
      focusCity: true,
      country: true,
    },
  });
  const requireWarmup = experiment.requireWarmupIdentities;
  const scope = experiment.identityGeoScope === "country" ? "country" : "city";
  const city = focusCity ?? experiment.focusCity;
  const region = focusRegion ?? experiment.focusRegion;

  const matchesGeo = (identity: Identity): boolean =>
    identityMatchesCampaignGeo(identity, {
      scope,
      focusCity: city,
      focusRegion: region,
      country: experiment.country,
    });

  const selections = await prisma.experimentIdentity.findMany({
    where: { experimentId, selected: true },
    include: { identity: true },
  });

  if (selections.length > 0) {
    const selected = selections
      .map((row) => row.identity)
      .filter((identity) => identityAllowedForCampaign(identity, requireWarmup))
      .filter(matchesGeo);
    // Keep explicit selection when it matches geo; otherwise fall back to city/region pool.
    if (selected.length > 0) {
      return selected;
    }
  }

  const identities = await prisma.identity.findMany({
    where: {
      active: true,
      ...(scope === "country"
        ? experiment.country
          ? { country: experiment.country }
          : {}
        : city?.trim()
          ? { city: city.trim() }
          : !city?.trim() && region && region !== "ALL"
            ? { region }
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
