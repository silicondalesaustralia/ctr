import type {
  SessionEventType,
  SessionStatus,
  TreatmentGroup,
} from "@prisma/client";
import { prisma } from "../db/client.js";
import { logSessionEvent } from "../config/logger.js";

export interface CreateSessionInput {
  experimentId: string;
  identityId: string;
  queryText: string;
  group: TreatmentGroup;
  scheduledSessionId?: string;
  engagementTemplate?: string;
  personaId?: string;
  sessionTraitsJson?: string;
}

export interface SessionUpdateInput {
  status?: SessionStatus;
  endedAt?: Date;
  proxyProvider?: string;
  proxyCountry?: string;
  proxyRegion?: string;
  proxyCity?: string;
  proxyIpHash?: string;
  googleLoaded?: boolean;
  searchSubmitted?: boolean;
  targetFound?: boolean;
  serpPage?: number;
  observedPosition?: number;
  resultTitle?: string;
  resultUrl?: string;
  targetClicked?: boolean;
  targetSkipped?: boolean;
  landingUrl?: string;
  finalUrl?: string;
  pageviews?: number;
  internalClicks?: number;
  scrollDepth?: number;
  durationSeconds?: number;
  bytesTransferred?: bigint;
  personaId?: string;
  sessionTraitsJson?: string;
  searchAttempts?: number;
  queriesUsedJson?: string;
  backToSerp?: boolean;
  blockReason?: string;
  errorCode?: string;
  errorMessage?: string;
}

export async function createSessionRecord(input: CreateSessionInput) {
  return prisma.session.create({
    data: {
      experimentId: input.experimentId,
      identityId: input.identityId,
      queryText: input.queryText,
      group: input.group,
      scheduledSessionId: input.scheduledSessionId,
      engagementTemplate: input.engagementTemplate,
      personaId: input.personaId,
      sessionTraitsJson: input.sessionTraitsJson,
      status: "running",
      startedAt: new Date(),
    },
  });
}

export async function updateSessionRecord(
  sessionId: string,
  update: SessionUpdateInput,
) {
  return prisma.session.update({
    where: { id: sessionId },
    data: update,
  });
}

export async function appendSessionEvent(
  sessionId: string,
  eventType: SessionEventType,
  metadata?: Record<string, unknown>,
) {
  await prisma.sessionEvent.create({
    data: {
      sessionId,
      eventType,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    },
  });

  logSessionEvent(eventType, { sessionId, ...metadata });
}

export async function completeSession(
  sessionId: string,
  update: SessionUpdateInput,
) {
  return updateSessionRecord(sessionId, {
    ...update,
    endedAt: new Date(),
  });
}

export async function getSessionWithEvents(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      events: { orderBy: { timestamp: "asc" } },
      identity: true,
      experiment: true,
    },
  });
}
