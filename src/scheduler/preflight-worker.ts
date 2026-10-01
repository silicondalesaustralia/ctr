import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { getPreflightJob, failPreflightJob, persistJob } from "../campaign/preflight-jobs.js";
import { KEY_PREFIX, deserializeJob, type PreflightJob, type StoredPreflightJob } from "../campaign/preflight-job-serde.js";
import { runPreflightJob } from "../campaign/preflight-request.js";
import { withBrowserJobExclusive } from "./browser-job-mutex.js";

async function listJobs(): Promise<PreflightJob[]> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: KEY_PREFIX } } });
  const jobs: PreflightJob[] = [];
  for (const row of rows) {
    try {
      const job = deserializeJob(JSON.parse(row.value) as StoredPreflightJob);
      if (job) jobs.push(job);
    } catch (error) {
      logger.warn({ event: "preflight_job_parse_failed", key: row.key, error: String(error) });
    }
  }
  return jobs.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

/** Worker boot: a job left "running" died with the previous process. */
export async function failStrandedPreflightJobs(): Promise<void> {
  for (const job of (await listJobs()).filter((candidate) => candidate.status === "running")) {
    await failPreflightJob(job.id, "Worker restarted during validation — run it again");
  }
}

let busy = false;

/**
 * Runs the oldest queued job inside the browser mutex (ahead of queued sessions and
 * warmups), so it never opens a profile a session or warmup is using.
 */
export async function pollPreflightJobs(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const next = (await listJobs()).find((job) => job.status === "queued");
    if (!next) return;

    await withBrowserJobExclusive(async () => {
      const job = await getPreflightJob(next.id);
      if (!job || job.status !== "queued") return;
      if (!job.request) {
        await failPreflightJob(job.id, "Validation request missing — run it again");
        return;
      }
      job.status = "running";
      await persistJob(job, true);
      logger.info({ event: "preflight_job_started", jobId: job.id, queries: job.totalCount });
      await runPreflightJob(job.id, job.request);
    }, { priority: true });
  } catch (error) {
    logger.error({ event: "preflight_poll_failed", error: String(error) });
  } finally {
    busy = false;
  }
}
