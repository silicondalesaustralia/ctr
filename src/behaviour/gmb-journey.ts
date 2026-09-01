import type { ExperimentQuery } from "@prisma/client";
import type { Page } from "playwright";
import { isDryRun } from "../config/env.js";
import {
  checkBlocked,
  openGoogle,
  typeAndSubmitQuery,
} from "../browser/google-search.js";
import { clickLocalPackResult, findGmbInLocalPack } from "../browser/local-pack.js";
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

export interface GmbJourneyInput {
  page: Page;
  persona: Persona;
  traits: SessionTraits;
  query: ExperimentQuery;
  businessName: string;
  placeId?: string | null;
  actions: GmbAction[];
  onEvent: BehaviourEventCallback;
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

  await openGoogle(page);
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

  const found = await findGmbInLocalPack(page, { businessName, placeId });
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

  await onEvent("local_pack_found", {
    businessName: found.title,
    position: found.position,
    placeId: found.placeId,
    cid: found.cid,
    source: found.source,
  });

  await clickLocalPackResult(page, found);
  await onEvent("gmb_opened", { title: found.title, href: found.href });
  await onEvent("target_clicked", { kind: "local_pack" });
  await dwellOnListing(page);

  const actionResults: GmbActionResult[] = [];
  const secondary = pickSecondaryAction(actions);
  if (secondary) {
    const result = await performGmbAction(page, secondary);
    actionResults.push(result);
    const eventType =
      secondary === "website"
        ? "gmb_action_website"
        : secondary === "directions"
          ? "gmb_action_directions"
          : "gmb_action_call";
    await onEvent(eventType, { success: result.success, detail: result.detail });

    if (secondary === "website" && result.success) {
      const site = await runSiteJourney({ page, persona, traits, onEvent });
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
            position: found.position,
          }),
        ],
        serpPage: 1,
        observedPosition: found.position,
        resultTitle: found.title,
        resultUrl: found.href,
        landingUrl: site.finalUrl ?? page.url(),
        actionResults,
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
        position: found.position,
      }),
    ],
    serpPage: 1,
    observedPosition: found.position,
    resultTitle: found.title,
    resultUrl: found.href,
    landingUrl: page.url(),
    actionResults,
  };
}
