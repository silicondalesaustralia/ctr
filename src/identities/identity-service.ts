import { DeviceClass, ProfileProvider, type Identity } from "@prisma/client";
import { prisma } from "../db/client.js";
import { assignPersona } from "../behaviour/personas.js";
import { createBrowserProvider, getMockBrowserProvider } from "../providers/browser/index.js";
import { getEnv } from "../config/env.js";
import { AU_REGIONS, isRegionCoherent, pickWeightedRegion } from "./regions.js";
import { isWarmupEligible, scheduleWarmupForIdentity } from "../warmup/warmup-service.js";

export interface CreateIdentitiesOptions {
  count: number;
  desktopPercent?: number;
}

function externalIdForIndex(index: number): string {
  return `au_${String(index).padStart(3, "0")}`;
}

export function parseExternalIdNumber(externalId: string): number | null {
  const match = /^au_(\d+)$/.exec(externalId);
  if (!match) return null;
  return Number.parseInt(match[1]!, 10);
}

export async function getMaxExternalIdNumber(): Promise<number> {
  const identities = await prisma.identity.findMany({ select: { externalId: true } });
  let max = 0;
  for (const { externalId } of identities) {
    const number = parseExternalIdNumber(externalId);
    if (number != null) {
      max = Math.max(max, number);
    }
  }
  return max;
}

export async function countActiveIdentities(): Promise<number> {
  return prisma.identity.count({ where: { active: true } });
}

export async function assignMissingPersonas(): Promise<number> {
  const identities = await prisma.identity.findMany({
    where: { personaId: null },
    orderBy: { externalId: "asc" },
  });

  let assigned = 0;
  for (const identity of identities) {
    const persona = assignPersona(identity.deviceClass, identity.externalId);
    await prisma.identity.update({
      where: { id: identity.id },
      data: {
        personaId: persona.id,
        personaAssignedAt: new Date(),
      },
    });
    assigned += 1;
  }

  return assigned;
}

async function createIdentityBatch(
  startIndex: number,
  count: number,
  desktopPercent: number,
): Promise<Identity[]> {
  const browserProvider = createBrowserProvider();
  const env = getEnv();
  const provider =
    env.BROWSER_PROFILE_PROVIDER === "gologin"
      ? ProfileProvider.gologin
      : ProfileProvider.mock;

  const desktopCount = Math.round((count * desktopPercent) / 100);
  const created: Identity[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    const index = startIndex + offset;
    const externalId = externalIdForIndex(index);
    const regionConfig = pickWeightedRegion(offset, count);
    const deviceClass = offset < desktopCount ? DeviceClass.desktop : DeviceClass.mobile;
    const osFamily =
      deviceClass === DeviceClass.mobile
        ? "android"
        : offset % 2 === 0
          ? "windows"
          : "mac";

    const profile = await browserProvider.createProfile({
      name: externalId,
      deviceClass,
      osFamily,
      locale: "en-AU",
      timezone: regionConfig.timezone,
      region: regionConfig.region,
      city: regionConfig.city,
    });

    if (provider === ProfileProvider.mock) {
      getMockBrowserProvider().registerExistingProfile(profile);
    }

    const persona = assignPersona(deviceClass, externalId);

    const identity = await prisma.identity.create({
      data: {
        externalId,
        externalProfileId: profile.profileId,
        profileProvider: provider,
        deviceClass,
        osFamily,
        locale: "en-AU",
        timezone: regionConfig.timezone,
        country: "AU",
        region: regionConfig.region,
        city: regionConfig.city,
        active: true,
        personaId: persona.id,
        personaAssignedAt: new Date(),
      },
    });

    created.push(identity);
    await scheduleWarmupForIdentity(identity);
  }

  return created;
}

export async function createIdentities(
  options: CreateIdentitiesOptions,
): Promise<Identity[]> {
  const { count, desktopPercent = 65 } = options;
  const browserProvider = createBrowserProvider();
  const env = getEnv();
  const provider =
    env.BROWSER_PROFILE_PROVIDER === "gologin"
      ? ProfileProvider.gologin
      : ProfileProvider.mock;

  const desktopCount = Math.round((count * desktopPercent) / 100);
  const created: Identity[] = [];

  for (let i = 0; i < count; i += 1) {
    const externalId = externalIdForIndex(i + 1);
    const regionConfig = pickWeightedRegion(i, count);
    const deviceClass = i < desktopCount ? DeviceClass.desktop : DeviceClass.mobile;
    const osFamily =
      deviceClass === DeviceClass.mobile
        ? "android"
        : i % 2 === 0
          ? "windows"
          : "mac";

    const profile = await browserProvider.createProfile({
      name: externalId,
      deviceClass,
      osFamily,
      locale: "en-AU",
      timezone: regionConfig.timezone,
      region: regionConfig.region,
      city: regionConfig.city,
    });

    if (provider === ProfileProvider.mock) {
      getMockBrowserProvider().registerExistingProfile(profile);
    }

    const persona = assignPersona(deviceClass, externalId);

    const identity = await prisma.identity.upsert({
      where: { externalId },
      update: {
        externalProfileId: profile.profileId,
        profileProvider: provider,
        deviceClass,
        osFamily,
        locale: "en-AU",
        timezone: regionConfig.timezone,
        country: "AU",
        region: regionConfig.region,
        city: regionConfig.city,
        active: true,
      },
      create: {
        externalId,
        externalProfileId: profile.profileId,
        profileProvider: provider,
        deviceClass,
        osFamily,
        locale: "en-AU",
        timezone: regionConfig.timezone,
        country: "AU",
        region: regionConfig.region,
        city: regionConfig.city,
        active: true,
        personaId: persona.id,
        personaAssignedAt: new Date(),
      },
    });

    if (!identity.personaId) {
      const updated = await prisma.identity.update({
        where: { id: identity.id },
        data: {
          personaId: persona.id,
          personaAssignedAt: new Date(),
        },
      });
      created.push(updated);
      await scheduleWarmupForIdentity(updated);
    } else {
      created.push(identity);
      await scheduleWarmupForIdentity(identity);
    }
  }

  return created;
}

export async function createAdditionalIdentities(
  options: CreateIdentitiesOptions,
): Promise<{ created: Identity[]; fromExternalId: string; toExternalId: string }> {
  const { count, desktopPercent = 65 } = options;
  if (count <= 0) {
    throw new Error("count must be positive");
  }
  if (count > 50) {
    throw new Error("Cannot create more than 50 identities at once");
  }

  const maxIndex = await getMaxExternalIdNumber();
  const created = await createIdentityBatch(maxIndex + 1, count, desktopPercent);

  return {
    created,
    fromExternalId: externalIdForIndex(maxIndex + 1),
    toExternalId: externalIdForIndex(maxIndex + count),
  };
}

export interface ValidationIssue {
  identityId: string;
  externalId: string;
  issue: string;
}

export async function validateIdentities(): Promise<ValidationIssue[]> {
  const identities = await prisma.identity.findMany();
  const issues: ValidationIssue[] = [];

  for (const identity of identities) {
    if (!isRegionCoherent(identity.region, identity.timezone, identity.locale)) {
      issues.push({
        identityId: identity.id,
        externalId: identity.externalId,
        issue: `Inconsistent region/timezone/locale: ${identity.region}/${identity.timezone}/${identity.locale}`,
      });
    }

    const regionMatch = AU_REGIONS.find((r) => r.region === identity.region);
    if (regionMatch && regionMatch.city !== identity.city) {
      issues.push({
        identityId: identity.id,
        externalId: identity.externalId,
        issue: `City ${identity.city} does not match expected city for ${identity.region}`,
      });
    }

    if (!identity.externalProfileId) {
      issues.push({
        identityId: identity.id,
        externalId: identity.externalId,
        issue: "Missing external profile ID",
      });
    }
  }

  return issues;
}

export async function getIdentityByExternalId(externalId: string): Promise<Identity | null> {
  return prisma.identity.findUnique({ where: { externalId } });
}

export async function isIdentityEligible(
  identityId: string,
  experimentId: string,
  scheduledAt: Date,
  minGapDays: number,
  maxPerDay: number,
): Promise<boolean> {
  const identity = await prisma.identity.findUnique({ where: { id: identityId } });
  if (!identity?.active) return false;

  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
    select: { requireWarmupIdentities: true },
  });
  if (experiment?.requireWarmupIdentities && !isWarmupEligible(identity)) return false;

  const dayStart = new Date(scheduledAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const sameDayCount = await prisma.scheduledSession.count({
    where: {
      identityId,
      scheduledAt: { gte: dayStart, lt: dayEnd },
      status: { not: "cancelled" },
    },
  });

  if (sameDayCount >= maxPerDay) return false;

  if (identity.lastUsedAt) {
    const gapMs = scheduledAt.getTime() - identity.lastUsedAt.getTime();
    const gapDays = gapMs / (1000 * 60 * 60 * 24);
    if (gapDays < minGapDays) return false;
  }

  const running = await prisma.session.findFirst({
    where: {
      identityId,
      status: "running",
    },
  });

  return !running;
}

export async function updateIdentityStats(
  identityId: string,
  updates: {
    query?: string;
    experimentId?: string;
    blocked?: boolean;
    targetClicked?: boolean;
    googleSession?: boolean;
  },
): Promise<void> {
  const identity = await prisma.identity.findUnique({ where: { id: identityId } });
  if (!identity) return;

  await prisma.identity.update({
    where: { id: identityId },
    data: {
      totalSessions: { increment: 1 },
      googleSessions: updates.googleSession ? { increment: 1 } : undefined,
      targetClicks: updates.targetClicked ? { increment: 1 } : undefined,
      blockedSessions: updates.blocked ? { increment: 1 } : undefined,
      lastQuery: updates.query,
      lastExperimentId: updates.experimentId,
      lastUsedAt: new Date(),
    },
  });
}
