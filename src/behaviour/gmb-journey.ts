import type { ExperimentQuery } from "@prisma/client";
import type { Page } from "../browser/pw.js";
import { isDryRun } from "../config/env.js";
import {
  checkBlocked,
  openGoogle,
  typeAndSubmitQuery,
} from "../browser/google-search.js";
import { GoogleBlockedError } from "../browser/blocked-detection.js";
import { clickLocalPackResult, findGmbInLocalPack } from "../browser/local-pack.js";
import { captureRankView } from "../browser/rank-view.js";
import type { GmbAction } from "../campaign/gmb-types.js";
import { FAST_DRY_RUN_PERSONA } from "./personas.js";
import {
  dwellOnListing,
  performGmbAction,
  pickSecondaryAction,
  type GmbActionResult,
} from "./gmb-actions.js";
import type {
  BehaviourEventCallback,
  Persona,
  SearchAttempt,
  SearchJourneyResult,
  SessionTraits,
} from "./types.js";
import { runSiteJourney } from "./site-journey.js";
import type { GoogleTarget } from "../geo/google-target.js";

export interface GmbJourneyInput {
  page: Page;
  persona: Persona;
  traits: SessionTraits;
  query: ExperimentQuery;
  businessName: string;
  placeId?: string | null;
  actions: GmbAction[];
  onEvent: BehaviourEventCallback;
  /** Identity's Google country/language. */
  google: GoogleTarget;
}

function attempt(query: ExperimentQuery, extras?: Partial<SearchAttempt>): SearchAttempt {
  return {
    queryText: query.query,
    queryType: query.queryType,
    targetFound: false,
    clicked: false,
    abandoned: false,
    ...extras,
  };
}

export async function runGmbSearchJourney(
  input: GmbJourneyInput,
): Promise<SearchJourneyResult & { actionResults: GmbActionResult[] }> {
  const { page, traits, query, businessName, placeId, actions, onEvent } = input;
  const persona = isDryRun() ? FAST_DRY_RUN_PERSONA : input.persona;

  if (isDryRun()) {
    await onEvent("google_loaded");
    await onEvent("search_submitted", { query: query.query });
    await onEvent("serp_loaded");
    await onEvent("local_pack_found", { businessName, position: 1 });
    await onEvent("gmb_opened", { businessName });
    return {
      status: "completed",
      googleLoaded: true,
      searchSubmitted: true,
      targetFound: true,
      targetClicked: true,
      targetSkipped: false,
      searches: [attempt(query, { targetFound: true, clicked: true, serpPage: 1, position: 1 })],
      serpPage: 1,
      observedPosition: 1,
      resultTitle: businessName,
      landingUrl: page.url(),
      actionResults: [],
    };
  }

  await openGoogle(page, input.google);
  await onEvent("google_loaded");
  const blockedOpen = await checkBlocked(page);
  if (blockedOpen.blocked) {
    return {
      status: "blocked",
      googleLoaded: true,
      searchSubmitted: false,
      targetFound: false,
      targetClicked: false,
      targetSkipped: false,
      searches: [],
      blockReason: blockedOpen.reason,
      actionResults: [],
    };
  }

  await typeAndSubmitQuery(page, query.query, persona, traits);
  await onEvent("search_submitted", { query: query.query });
  await onEvent("serp_loaded");

  const blockedSearch = await checkBlocked(page);
  if (blockedSearch.blocked) {
    return {
      status: "blocked",
      googleLoaded: true,
      searchSubmitted: true,
      targetFound: false,
      targetClicked: false,
      targetSkipped: false,
      searches: [attempt(query)],
      blockReason: blockedSearch.reason,
      actionResults: [],
    };
  }

  let found: Awaited<ReturnType<typeof findGmbInLocalPack>>;
  try {
    found = await findGmbInLocalPack(page, {
      businessName,
      placeId,
      query: query.query,
      allowBrandedFallback: true,
    });
  } catch (error) {
    if (!(error instanceof GoogleBlockedError)) throw error;
    return {
      status: "blocked",
      googleLoaded: true,
      searchSubmitted: true,
      targetFound: false,
      targetClicked: false,
      targetSkipped: false,
      searches: [attempt(query)],
      blockReason: error.reason,
      actionResults: [],
    };
  }
  if (!found) {
    await onEvent("target_not_found", { businessName });
    return {
      status: "target_not_found",
      googleLoaded: true,
      searchSubmitted: true,
      targetFound: false,
      targetClicked: false,
      targetSkipped: false,
      searches: [attempt(query, { serpPage: 1 })],
      serpPage: 1,
      actionResults: [],
    };
  }

  const rankedPosition = found.source === "branded_search" ? undefined : found.position;
  await onEvent("local_pack_found", {
    businessName: found.title,
    position: rankedPosition ?? null,
    placeId: found.placeId,
    cid: found.cid,
    source: found.source,
  });
  const rankView = (await captureRankView(page, found.title, found.source)) ?? undefined;

  await clickLocalPackResult(page, found);
  await onEvent("gmb_opened", { title: found.title, href: found.href });
  await onEvent("target_clicked", { kind: "local_pack" });
  await dwellOnListing(page);

  const actionResults: GmbActionResult[] = [];
  const secondary = pickSecondaryAction(actions);
  if (secondary) {
    const { result, sitePage } = await performGmbAction(page, secondary, found.title || businessName);
    actionResults.push(result);
    const eventType =
      result.action === "website"
        ? "gmb_action_website"
        : result.action === "directions"
          ? "gmb_action_directions"
          : "gmb_action_call";
    await onEvent(eventType, { success: result.success, detail: result.detail });

    if (result.action === "website" && result.success && sitePage) {
      const site = await runSiteJourney({ page: sitePage, persona, traits, onEvent });
      return {
        status: "completed",
        googleLoaded: true,
        searchSubmitted: true,
        targetFound: true,
        targetClicked: true,
        targetSkipped: false,
        searches: [
          attempt(query, {
            targetFound: true,
            clicked: true,
            serpPage: 1,
            position: rankedPosition,
          }),
        ],
        serpPage: 1,
        observedPosition: rankedPosition,
        resultTitle: found.title,
        resultUrl: found.href,
        landingUrl: site.finalUrl ?? sitePage.url(),
        actionResults,
        rankView,
      };
    }
  }

  return {
    status: "completed",
    googleLoaded: true,
    searchSubmitted: true,
    targetFound: true,
    targetClicked: true,
    targetSkipped: false,
    searches: [
      attempt(query, {
        targetFound: true,
        clicked: true,
        serpPage: 1,
        position: rankedPosition,
      }),
    ],
    serpPage: 1,
    observedPosition: rankedPosition,
    resultTitle: found.title,
    resultUrl: found.href,
    landingUrl: page.url(),
    actionResults,
    rankView,
  };
}
