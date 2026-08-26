import type { QueryType, SessionEventType } from "@prisma/client";

export type TypingSpeed = "fast" | "medium" | "normal" | "slow";
export type PageDepth = "shallow" | "medium" | "deep";
export type DeviceFilter = "any" | "desktop" | "mobile";

export interface Persona {
  id: string;
  weight: number;
  deviceFilter: DeviceFilter;
  typingSpeed: TypingSpeed;
  typingDelayMs: [number, number];
  preTypePauseMs: [number, number];
  postTypePauseMs: [number, number];
  serpScanSeconds: [number, number];
  serpScrollProbability: number;
  serpScrollDepth: [number, number];
  reformulateProbability: number;
  maxSearchesPerSession: number;
  abandonBeforeInspectProbability: number;
  targetClickProbabilityIfFound: number;
  pageDepth: PageDepth;
  internalClickProbability: number;
  backToSerpProbability: number;
  maxInternalPages: number;
  dwellSeconds: [number, number];
}

export interface SessionTraits {
  pace: number;
  attentionLevel: number;
  curiosity: number;
  searchConfidence: number;
  navigationDepth: number;
}

export interface BehaviourOverrides {
  personaWeights?: Record<string, number>;
  allowQueryReformulation?: boolean;
  allowSearchAbandon?: boolean;
  allowTargetSkip?: boolean;
}

export type SearchJourneyStatus =
  | "completed"
  | "search_abandoned"
  | "target_found_no_click"
  | "target_not_found"
  | "blocked";

export type SiteJourneyBranch =
  | "short_read"
  | "normal_read"
  | "internal_one"
  | "back_to_serp"
  | "internal_multi";

export interface SearchAttempt {
  queryText: string;
  queryType: QueryType;
  targetFound: boolean;
  clicked: boolean;
  abandoned: boolean;
  serpPage?: number;
  position?: number;
}

export interface SearchJourneyResult {
  status: SearchJourneyStatus;
  googleLoaded: boolean;
  searchSubmitted: boolean;
  targetFound: boolean;
  targetClicked: boolean;
  targetSkipped: boolean;
  searches: SearchAttempt[];
  serpPage?: number;
  observedPosition?: number;
  resultTitle?: string;
  resultUrl?: string;
  landingUrl?: string;
  blockReason?: string;
}

export interface SiteJourneyResult {
  pageviews: number;
  internalClicks: number;
  scrollDepth: number;
  durationSeconds: number;
  finalUrl: string;
  backToSerp: boolean;
  branch: SiteJourneyBranch;
}

export type BehaviourEventCallback = (
  eventType: SessionEventType,
  metadata?: Record<string, unknown>,
) => Promise<void>;
