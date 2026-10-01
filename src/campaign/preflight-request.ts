import {
  getCurrentCampaign,
  previewCampaignIntensity,
  type UpsertCampaignInput,
} from "../experiments/campaign-service.js";
import { buildCampaignProposal, type CampaignProposal } from "./campaign-proposal.js";
import { buildGmbCampaignProposal } from "./gmb-proposal.js";
import { runKeywordPreflight } from "./keyword-preflight.js";
import { completePreflightJob, failPreflightJob } from "./preflight-jobs.js";
import { runSerpPreflightChecks } from "./serp-preflight-runner.js";
import { DEFAULT_MAX_SERP_PAGES } from "../config/serp-defaults.js";

export type PreflightRequestBody = Partial<UpsertCampaignInput> & {
  maxSerpPages?: number;
  identityExternalId?: string;
};

export async function buildBaseProposalForPreflight(body: PreflightRequestBody): Promise<CampaignProposal> {
  const current = await getCurrentCampaign();
  const isGmb = body.campaignKind === "gmb";

  let baseProposal: CampaignProposal = isGmb
    ? await buildGmbCampaignProposal({
        keyword: body.keyword!,
        focusCity: body.focusCity ?? current?.focusCity ?? "",
        gmbBusinessName: body.gmbBusinessName ?? current?.gmbBusinessName ?? "",
        gmbMapsUrl: body.gmbMapsUrl ?? body.targetUrl ?? current?.gmbMapsUrl ?? "",
        gmbActions: Array.isArray(body.gmbActions)
          ? undefined
          : (body.gmbActions ?? undefined),
      })
    : await buildCampaignProposal({
        keyword: body.keyword!,
        targetUrl: body.targetUrl!,
        region: body.region!,
        gscConnectionId: body.gscConnectionId ?? null,
        gscSiteUrl: body.gscSiteUrl ?? null,
      });

  if (body.queries?.length) {
    const intensity = await previewCampaignIntensity(body as UpsertCampaignInput, current?.id);
    baseProposal = {
      ...baseProposal,
      keyword: body.keyword!.trim(),
      targetUrl: (body.targetUrl ?? body.gmbMapsUrl ?? baseProposal.targetUrl).trim(),
      region: (body.region ?? baseProposal.region).trim().toUpperCase(),
      campaignKind: isGmb ? "gmb" : "url",
      focusCity: body.focusCity ?? baseProposal.focusCity,
      gmbBusinessName: body.gmbBusinessName ?? baseProposal.gmbBusinessName,
      gmbPlaceId: body.gmbPlaceId ?? baseProposal.gmbPlaceId,
      gmbMapsUrl: body.gmbMapsUrl ?? baseProposal.gmbMapsUrl,
      campaignDurationDays: body.campaignDurationDays ?? baseProposal.campaignDurationDays,
      treatmentIntensity: body.treatmentIntensity ?? baseProposal.treatmentIntensity,
      adaptivePacing: body.adaptivePacing ?? baseProposal.adaptivePacing,
      recalculateEveryDays: body.recalculateEveryDays ?? baseProposal.recalculateEveryDays,
      maxShareOfSearchDemand: body.maxShareOfSearchDemand ?? baseProposal.maxShareOfSearchDemand,
      maxShareOfGscImpressions:
        body.maxShareOfGscImpressions ?? baseProposal.maxShareOfGscImpressions,
      desktopPercent: body.desktopPercent ?? baseProposal.desktopPercent,
      ctrSource: body.ctrSource ?? baseProposal.ctrSource,
      queries: body.queries,
      intensity,
      plannedSessionCap: body.plannedSessionCap ?? null,
      targetIdentityCount: body.targetIdentityCount ?? null,
      organicMaxSessionsPerIdentity: body.organicMaxSessionsPerIdentity,
    };
  } else {
    baseProposal = {
      ...baseProposal,
      campaignKind: isGmb ? "gmb" : baseProposal.campaignKind ?? "url",
      focusCity: body.focusCity ?? baseProposal.focusCity,
      gmbBusinessName: body.gmbBusinessName ?? baseProposal.gmbBusinessName,
      gmbPlaceId: body.gmbPlaceId ?? baseProposal.gmbPlaceId,
      gmbMapsUrl: body.gmbMapsUrl ?? baseProposal.gmbMapsUrl,
      plannedSessionCap: body.plannedSessionCap ?? null,
      targetIdentityCount: body.targetIdentityCount ?? null,
      organicMaxSessionsPerIdentity: body.organicMaxSessionsPerIdentity,
    };
  }

  return baseProposal;
}

export async function runPreflightJob(jobId: string, body: PreflightRequestBody): Promise<void> {
  try {
    const baseProposal = await buildBaseProposalForPreflight(body);
    const proposal = await runKeywordPreflight(
      {
        proposal: baseProposal,
        maxSerpPages: body.maxSerpPages ?? DEFAULT_MAX_SERP_PAGES,
        identityExternalId: body.identityExternalId,
      },
      (queries, context) =>
        runSerpPreflightChecks({
          queries,
          ...context,
          jobId,
        }),
    );
    await completePreflightJob(jobId, proposal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failPreflightJob(jobId, message);
  }
}
