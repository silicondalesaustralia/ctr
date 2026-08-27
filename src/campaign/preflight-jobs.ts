import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { getEnv } from "../config/env.js";
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
}

const memoryJobs = new Map<string, PreflightJob>();
const TTL_SECONDS = 60 * 60;
const KEY_PREFIX = "preflight:job:";

let redis: Redis | null = null;
let redisDisabled = false;

function disableRedis(reason: string, error: unknown): void {
  if (redisDisabled) return;
  redisDisabled = true;
  redis?.disconnect();
  redis = null;
  const message = error instanceof Error ? error.message : String(error);
  logger.warn({
    event: "preflight_redis_disabled",
    reason,
    error: message,
  });
}

function getRedis(): Redis | null {
  if (redisDisabled) return null;
  if (redis) return redis;

  const url = getEnv().REDIS_URL.trim();
  if (!url || url === "redis://localhost:6379") {
    return null;
  }

  redis = new Redis(url, { maxRetriesPerRequest: null });
  redis.on("error", (error) => {
    disableRedis("connection_error", error);
  });
  return redis;
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
  };
}

function deserializeJob(stored: StoredPreflightJob): PreflightJob {
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

  const client = getRedis();
  if (!client) return;

  try {
    await client.setex(`${KEY_PREFIX}${job.id}`, TTL_SECONDS, JSON.stringify(serializeJob(job)));
  } catch (error) {
    disableRedis("persist_failed", error);
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

  const client = getRedis();
  if (!client) return null;

  try {
    const raw = await client.get(`${KEY_PREFIX}${id}`);
    if (!raw) return null;
    const job = deserializeJob(JSON.parse(raw) as StoredPreflightJob);
    memoryJobs.set(id, job);
    return job;
  } catch (error) {
    disableRedis("read_failed", error);
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
