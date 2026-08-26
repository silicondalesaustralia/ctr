import type { Experiment, ExperimentQuery, Identity, TreatmentGroup } from "@prisma/client";
import { prisma } from "../db/client.js";
import { selectWeightedQuery } from "../experiments/experiment-service.js";
import {
  addMinutes,
  daysInMonth,
  endOfMonth,
  parseTimeToMinutes,
  randomBetween,
  startOfMonth,
} from "../utils/helpers.js";
import { isIdentityEligible } from "../identities/identity-service.js";

export interface ScheduleGeneratorInput {
  experiment: Experiment;
  queries: ExperimentQuery[];
  identities: Identity[];
  month?: Date;
  treatmentGroups?: TreatmentGroup[];
}

function distributeMonthlyTotal(total: number, days: number): number[] {
  const base = Math.floor(total / days);
  let remainder = total - base * days;
  const daily = Array.from({ length: days }, () => base);
  let index = 0;
  while (remainder > 0) {
    const idx = index % days;
    daily[idx] = (daily[idx] ?? 0) + 1;
    remainder -= 1;
    index += 1;
  }

  for (let i = daily.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [daily[i], daily[j]] = [daily[j]!, daily[i]!];
  }

  return daily;
}

function randomTimeInWindow(date: Date, start: string, end: string): Date {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  const minute = randomBetween(startMinutes, endMinutes);
  const result = new Date(date);
  result.setHours(Math.floor(minute / 60), minute % 60, randomBetween(0, 59), 0);
  return result;
}

export async function generateMonthlySchedule(
  input: ScheduleGeneratorInput,
): Promise<number> {
  const month = input.month ?? new Date();
  const monthStart = startOfMonth(month);
  const days = daysInMonth(month);
  return generateCampaignSchedule({
    ...input,
    totalSessions: input.experiment.monthlySessionTarget,
    startDate: monthStart,
    durationDays: days,
    endDate: endOfMonth(month),
  });
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function buildQuerySlots(queries: ExperimentQuery[], totalSessions?: number): ExperimentQuery[] {
  const slots: ExperimentQuery[] = [];
  const hasAllocation = queries.some((q) => (q.allocatedSessions ?? 0) > 0);

  if (hasAllocation) {
    for (const query of queries) {
      const count = query.allocatedSessions ?? 0;
      for (let i = 0; i < count; i += 1) {
        slots.push(query);
      }
    }
  } else {
    const target = totalSessions ?? 0;
    for (let i = 0; i < target; i += 1) {
      slots.push(selectWeightedQuery(queries));
    }
  }

  return shuffleArray(slots);
}

export interface CampaignScheduleInput extends ScheduleGeneratorInput {
  totalSessions: number;
  startDate: Date;
  durationDays?: number;
  endDate?: Date;
}

export async function generateCampaignSchedule(
  input: CampaignScheduleInput,
): Promise<number> {
  const durationDays = input.durationDays ?? input.experiment.campaignDurationDays;
  const startDate = new Date(input.startDate);
  startDate.setHours(0, 0, 0, 0);
  const endDate =
    input.endDate ??
    new Date(startDate.getTime() + (durationDays - 1) * 24 * 60 * 60 * 1000);
  endDate.setHours(23, 59, 59, 999);

  const dailyTotals = distributeMonthlyTotal(input.totalSessions, durationDays);
  const groups: TreatmentGroup[] = input.treatmentGroups ?? ["search"];
  const identities = input.experiment.focusRegion
    ? input.identities.filter((identity) => identity.region === input.experiment.focusRegion)
    : input.identities;

  const desktopIdentities = identities.filter((i) => i.deviceClass === "desktop");
  const mobileIdentities = identities.filter((i) => i.deviceClass === "mobile");

  const querySlots = buildQuerySlots(input.queries, input.totalSessions);
  let slotIndex = 0;

  const scheduled: Array<{
    experimentId: string;
    identityId: string;
    queryId: string;
    group: TreatmentGroup;
    scheduledAt: Date;
  }> = [];

  let lastGlobalTime: Date | null = null;
  const identityLastScheduled = new Map<string, Date>();

  for (let day = 0; day < durationDays; day += 1) {
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + day);
    const countForDay = dailyTotals[day] ?? 0;

    for (let i = 0; i < countForDay; i += 1) {
      if (slotIndex >= querySlots.length) break;

      const query = querySlots[slotIndex]!;
      slotIndex += 1;
      const group = groups[Math.floor(Math.random() * groups.length)]!;
      const desktopPercent = input.experiment.desktopPercent ?? 65;
      const preferDesktop = Math.random() * 100 < desktopPercent;

      const pool =
        preferDesktop && desktopIdentities.length > 0
          ? desktopIdentities
          : mobileIdentities.length > 0
            ? mobileIdentities
            : identities;

      const eligible = [];
      for (const identity of pool.length > 0 ? pool : identities) {
        let scheduledAt = randomTimeInWindow(
          dayDate,
          input.experiment.scheduleStart,
          input.experiment.scheduleEnd,
        );

        if (lastGlobalTime) {
          const minGap = input.experiment.minMinutesBetweenGlobalSessions;
          const minTime = addMinutes(lastGlobalTime, minGap);
          if (scheduledAt < minTime) {
            scheduledAt = minTime;
          }
        }

        if (scheduledAt > endDate) continue;

        const lastForIdentity = identityLastScheduled.get(identity.id);
        if (lastForIdentity) {
          const gapDays =
            (scheduledAt.getTime() - lastForIdentity.getTime()) / (1000 * 60 * 60 * 24);
          if (gapDays < input.experiment.repeatIdentityMinGapDays) {
            continue;
          }
        }

        const ok = await isIdentityEligible(
          identity.id,
          input.experiment.id,
          scheduledAt,
          input.experiment.repeatIdentityMinGapDays,
          input.experiment.maxSessionsPerIdentityPerDay,
        );

        if (ok) {
          eligible.push({ identity, scheduledAt });
        }
      }

      if (eligible.length === 0) continue;

      const pick = eligible[Math.floor(Math.random() * eligible.length)]!;
      scheduled.push({
        experimentId: input.experiment.id,
        identityId: pick.identity.id,
        queryId: query.id,
        group,
        scheduledAt: pick.scheduledAt,
      });
      lastGlobalTime = pick.scheduledAt;
      identityLastScheduled.set(pick.identity.id, pick.scheduledAt);
    }
  }

  await prisma.scheduledSession.deleteMany({
    where: {
      experimentId: input.experiment.id,
      scheduledAt: { gte: startDate, lte: endDate },
      status: "scheduled",
    },
  });

  if (scheduled.length > 0) {
    await prisma.scheduledSession.createMany({ data: scheduled });
  }

  return scheduled.length;
}

export async function getDueScheduledSessions(limit = 1) {
  return prisma.scheduledSession.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
      experiment: { status: "active" },
    },
    include: {
      experiment: true,
      identity: true,
      query: true,
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });
}
