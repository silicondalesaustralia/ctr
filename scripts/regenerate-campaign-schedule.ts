#!/usr/bin/env node
import { Command } from "commander";
import { prisma } from "../src/db/client.js";
import { recalculateCampaignPacing } from "../src/campaign/adaptive-pacing.js";
import { generateCampaignSchedule } from "../src/scheduler/schedule-generator.js";
import { getCampaignIdentityPool } from "../src/warmup/warmup-service.js";
import { localHourMinute } from "../src/utils/helpers.js";

const program = new Command();

program
  .requiredOption("--experiment <id>", "experiment id or slug")
  .option("--full", "regenerate full campaign schedule from start date")
  .action(async (options: { experiment: string; full?: boolean }) => {
    const experiment = await prisma.experiment.findFirst({
      where: {
        OR: [{ id: options.experiment }, { slug: options.experiment }],
      },
      include: { queries: { where: { active: true } } },
    });

    if (!experiment) {
      throw new Error(`Experiment not found: ${options.experiment}`);
    }

    let count = 0;
    if (options.full) {
      await prisma.scheduledSession.updateMany({
        where: { experimentId: experiment.id, status: "scheduled" },
        data: { status: "cancelled" },
      });

      const identities = await getCampaignIdentityPool(experiment.id, experiment.focusRegion);
      count = await generateCampaignSchedule({
        experiment,
        queries: experiment.queries,
        identities,
        totalSessions: experiment.monthlySessionTarget,
        startDate: experiment.startDate ?? new Date(),
        durationDays: experiment.campaignDurationDays,
      });
    } else {
      const result = await recalculateCampaignPacing(experiment.id, { regenerateSchedule: true });
      count = result.updated;
    }

    const next = await prisma.scheduledSession.findMany({
      where: { experimentId: experiment.id, status: "scheduled" },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      select: { scheduledAt: true },
    });

    console.log(`Regenerated ${count} sessions for ${experiment.name}`);
    console.log(
      "Next slots (local):",
      next.map((row) => {
        const local = localHourMinute(row.scheduledAt, experiment.scheduleTimezone);
        return `${row.scheduledAt.toISOString()} → ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")} ${experiment.scheduleTimezone}`;
      }),
    );

    await prisma.$disconnect();
  });

program.parse();
