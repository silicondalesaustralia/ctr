import type { CampaignProposal } from "./campaign-proposal.js";
import type { PreflightRequestBody } from "./preflight-request.js";

/** queued: waiting for the worker, which runs preflight on warmed identity profiles. */
export type PreflightJobStatus = "queued" | "running" | "complete" | "error";

export interface PreflightJob {
  id: string;
  status: PreflightJobStatus;
  testedCount: number;
  totalCount: number;
  proposal: CampaignProposal | null;
  error: string | null;
  request: PreflightRequestBody | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface StoredPreflightJob {
  id: string;
  status: PreflightJobStatus;
  testedCount: number;
  totalCount: number;
  proposal: CampaignProposal | null;
  error: string | null;
  request?: PreflightRequestBody | null;
  startedAt: string;
  finishedAt: string | null;
  expiresAt: string;
}

const TTL_MS = 60 * 60 * 1000;
export const KEY_PREFIX = "preflight_job:";

export function storageKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

export function serializeJob(job: PreflightJob): StoredPreflightJob {
  return {
    id: job.id,
    status: job.status,
    testedCount: job.testedCount,
    totalCount: job.totalCount,
    proposal: job.proposal,
    error: job.error,
    request: job.request,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
  };
}

export function deserializeJob(stored: StoredPreflightJob): PreflightJob | null {
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
    request: stored.request ?? null,
    startedAt: new Date(stored.startedAt),
    finishedAt: stored.finishedAt ? new Date(stored.finishedAt) : null,
  };
}
