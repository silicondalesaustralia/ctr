import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import type { CampaignProposal } from "./campaign-proposal.js";

export type PreflightJobStatus = "running" | "complete" | "error";

export interface PreflightJob {
  id: string;
  status: PreflightJobStatus;
  testedCount: number;
  totalCount: number;
  proposal: CampaignProposal | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

interface StoredPreflightJob {
  id: string;
  status: PreflightJobStatus;
  testedCount: number;
  totalCount: number;
  proposal: CampaignProposal | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  expiresAt: string;
}

const memoryJobs = new Map<string, PreflightJob>();
const TTL_MS = 60 * 60 * 1000;
const KEY_PREFIX = "preflight_job:";

function storageKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function serializeJob(job: PreflightJob): StoredPreflightJob {
  return {
    id: job.id,
    status: job.status,
    testedCount: job.testedCount,
    totalCount: job.totalCount,
    proposal: job.proposal,
    error: job.error,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
  };
}

function deserializeJob(stored: StoredPreflightJob): PreflightJob | null {
  if (new Date(stored.expiresAt).getTime() < Date.now()) {
    return null;
  }

  return {
    id: stored.id,
    status: stored.status,
    testedCount: stored.testedCount,
    totalCount: stored.totalCount,
    proposal: stored.proposal,
    error: stored.error,
    startedAt: new Date(stored.startedAt),
    finishedAt: stored.finishedAt ? new Date(stored.finishedAt) : null,
  };
}

async function persistJob(job: PreflightJob): Promise<void> {
  memoryJobs.set(job.id, job);

  try {
    await prisma.appSetting.upsert({
      where: { key: storageKey(job.id) },
      create: {
        key: storageKey(job.id),
        value: JSON.stringify(serializeJob(job)),
      },
      update: {
        value: JSON.stringify(serializeJob(job)),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({
      event: "preflight_job_persist_failed",
      jobId: job.id,
      error: message,
    });
  }
}

export async function createPreflightJob(totalCount: number): Promise<PreflightJob> {
  const job: PreflightJob = {
    id: randomUUID(),
    status: "running",
    testedCount: 0,
    totalCount,
    proposal: null,
    error: null,
    startedAt: new Date(),
    finishedAt: null,
  };
  await persistJob(job);
  return job;
}

export async function getPreflightJob(id: string): Promise<PreflightJob | null> {
  const cached = memoryJobs.get(id);
  if (cached) return cached;

  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: storageKey(id) },
    });
    if (!row) return null;

    const job = deserializeJob(JSON.parse(row.value) as StoredPreflightJob);
    if (!job) return null;

    memoryJobs.set(id, job);
    return job;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({
      event: "preflight_job_read_failed",
      jobId: id,
      error: message,
    });
    return memoryJobs.get(id) ?? null;
  }
}

export async function updatePreflightJobProgress(id: string, testedCount: number): Promise<void> {
  const job = memoryJobs.get(id) ?? (await getPreflightJob(id));
  if (!job || job.status !== "running") return;
  job.testedCount = testedCount;
  await persistJob(job);
}

export async function completePreflightJob(id: string, proposal: CampaignProposal): Promise<void> {
  const job = memoryJobs.get(id) ?? (await getPreflightJob(id));
  if (!job) return;
  job.status = "complete";
  job.proposal = proposal;
  job.testedCount = job.totalCount;
  job.finishedAt = new Date();
  await persistJob(job);
}

export async function failPreflightJob(id: string, error: string): Promise<void> {
  const job = memoryJobs.get(id) ?? (await getPreflightJob(id));
  if (!job) return;
  job.status = "error";
  job.error = error;
  job.finishedAt = new Date();
  await persistJob(job);
}
