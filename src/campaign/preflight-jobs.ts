import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { getEnv } from "../config/env.js";
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

function getRedis(): Redis | null {
  if (redis) return redis;
  try {
    const url = getEnv().REDIS_URL;
    if (!url) return null;
    redis = new Redis(url, { maxRetriesPerRequest: null });
    return redis;
  } catch {
    return null;
  }
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
  await client.setex(`${KEY_PREFIX}${job.id}`, TTL_SECONDS, JSON.stringify(serializeJob(job)));
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
  const client = getRedis();
  if (client) {
    const raw = await client.get(`${KEY_PREFIX}${id}`);
    if (raw) {
      return deserializeJob(JSON.parse(raw) as StoredPreflightJob);
    }
  }
  return memoryJobs.get(id) ?? null;
}

export async function updatePreflightJobProgress(id: string, testedCount: number): Promise<void> {
  const job = (await getPreflightJob(id)) ?? memoryJobs.get(id);
  if (!job || job.status !== "running") return;
  job.testedCount = testedCount;
  await persistJob(job);
}

export async function completePreflightJob(id: string, proposal: CampaignProposal): Promise<void> {
  const job = (await getPreflightJob(id)) ?? memoryJobs.get(id);
  if (!job) return;
  job.status = "complete";
  job.proposal = proposal;
  job.testedCount = job.totalCount;
  job.finishedAt = new Date();
  await persistJob(job);
}

export async function failPreflightJob(id: string, error: string): Promise<void> {
  const job = (await getPreflightJob(id)) ?? memoryJobs.get(id);
  if (!job) return;
  job.status = "error";
  job.error = error;
  job.finishedAt = new Date();
  await persistJob(job);
}
