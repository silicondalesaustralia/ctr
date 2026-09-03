/** BullMQ lock must outlast Orbita/SERP runs or jobs stall while DB stays `running`. */
export const BULLMQ_JOB_LOCK_MS = 45 * 60 * 1000;
export const BULLMQ_STALLED_INTERVAL_MS = 5 * 60 * 1000;
