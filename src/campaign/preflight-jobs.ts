import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import type { CampaignProposal } from "./campaign-proposal.js";
import type { PreflightRequestBody } from "./preflight-request.js";
import {
  deserializeJob,
  serializeJob,
  storageKey,
  type PreflightJob,
  type StoredPreflightJob,
} from "./preflight-job-serde.js";

export type { PreflightJob, PreflightJobStatus } from "./preflight-job-serde.js";

const memoryJobs = new Map<string, PreflightJob>();

/** strict: rethrow storage errors (a queued job only exists for the worker once stored). */
export async function persistJob(job: PreflightJob, strict = false): Promise<void> {
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
    if (strict) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({
      event: "preflight_job_persist_failed",
      jobId: job.id,
      error: message,
    });
  }
}

export async function createPreflightJob(
  totalCount: number,
  request: PreflightRequestBody,
): Promise<PreflightJob> {
  const job: PreflightJob = {
    id: randomUUID(),
    status: "queued",
    testedCount: 0,
    totalCount,
    proposal: null,
    error: null,
    request,
    startedAt: new Date(),
    finishedAt: null,
  };
  await persistJob(job, true);
  return job;
}

/** Reads storage first: the worker, not this process, advances the job. */
export async function getPreflightJob(id: string): Promise<PreflightJob | null> {
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
