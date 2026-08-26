import type { SessionEventType } from "@prisma/client";
import { appendSessionEvent } from "./session-logger.js";

export async function recordSessionEvent(
  sessionId: string,
  eventType: SessionEventType,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await appendSessionEvent(sessionId, eventType, metadata);
}
