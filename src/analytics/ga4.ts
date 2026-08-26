import { getEnv } from "../config/env.js";

export interface Ga4VerificationSummary {
  sessions: number;
  landingMatches: number;
  auSessions: number;
}

export async function verifyGa4Traffic(
  _propertyId: string,
  _landingPage: string,
  _startDate: string,
  _endDate: string,
): Promise<Ga4VerificationSummary> {
  const env = getEnv();
  if (!env.GA4_PROPERTY_ID) {
    throw new Error(
      "GA4 verification requires GA4_PROPERTY_ID. GA4 is secondary verification only.",
    );
  }

  return {
    sessions: 0,
    landingMatches: 0,
    auSessions: 0,
  };
}
