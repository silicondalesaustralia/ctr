import type { Experiment } from "@prisma/client";
import { prisma } from "../db/client.js";
import { WARMUP_SYSTEM_SLUG } from "./warmup-config.js";

export async function getWarmupExperiment(): Promise<Experiment> {
  const existing = await prisma.experiment.findUnique({
    where: { slug: WARMUP_SYSTEM_SLUG },
  });

  if (existing) {
    return existing;
  }

  return prisma.experiment.create({
    data: {
      name: "Identity Warmup",
      slug: WARMUP_SYSTEM_SLUG,
      targetUrl: "https://example.com",
      targetDomain: "example.com",
      status: "draft",
      monthlySessionTarget: 0,
      campaignDurationDays: 365,
      focusRegion: null,
    },
  });
}

export function isWarmupExperiment(slug: string): boolean {
  return slug === WARMUP_SYSTEM_SLUG;
}
