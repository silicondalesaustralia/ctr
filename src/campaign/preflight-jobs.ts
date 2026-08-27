import { randomUUID } from "node:crypto";
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

const jobs = new Map<string, PreflightJob>();
const TTL_MS = 60 * 60 * 1000;

function pruneOldJobs(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, job] of jobs) {
    if (job.finishedAt && job.finishedAt.getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}

export function createPreflightJob(totalCount: number): PreflightJob {
  pruneOldJobs();
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
  jobs.set(job.id, job);
  return job;
}

export function getPreflightJob(id: string): PreflightJob | null {
  return jobs.get(id) ?? null;
}

export function updatePreflightJobProgress(id: string, testedCount: number): void {
  const job = jobs.get(id);
  if (!job || job.status !== "running") return;
  job.testedCount = testedCount;
}

export function completePreflightJob(id: string, proposal: CampaignProposal): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "complete";
  job.proposal = proposal;
  job.testedCount = job.totalCount;
  job.finishedAt = new Date();
}

export function failPreflightJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "error";
  job.error = error;
  job.finishedAt = new Date();
}
