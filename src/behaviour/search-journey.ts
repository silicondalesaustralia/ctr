import type { ExperimentQuery } from "@prisma/client";
import type { Page } from "playwright";
import { isDryRun } from "../config/env.js";
import {
  checkBlocked,
  loadDryRunSerp,
  openGoogle,
  typeAndSubmitQuery,
} from "../browser/google-search.js";
import {
  clickSerpResult,
  findTargetOnCurrentPage,
  goToNextSerpPage,
} from "../browser/serp-parser.js";
import { isProbabilisticBehaviourEnabled } from "./behaviour-config.js";
import { FAST_DRY_RUN_PERSONA } from "./personas.js";
import {
  pickReformulatedQuery,
  shouldAbandonBeforeInspect,
  shouldClickTarget,
  shouldReformulate,
} from "./query-evolution.js";
import { inspectSerp } from "./serp-inspection.js";
import type {
  BehaviourEventCallback,
  BehaviourOverrides,
  Persona,
  SearchAttempt,
  SearchJourneyResult,
  SessionTraits,
} from "./types.js";

export interface SearchJourneyInput {
  page: Page;
  persona: Persona;
  traits: SessionTraits;
  cluster: ExperimentQuery[];
  initialQuery: ExperimentQuery;
  targetDomain: string;
  targetUrl?: string;
  maxSerpPages: number;
  behaviourOverrides?: BehaviourOverrides;
  onEvent: BehaviourEventCallback;
}

async function findTargetWithInspection(
  page: Page,
  targetDomain: string,
  maxSerpPages: number,
  persona: Persona,
  traits: SessionTraits,
  onEvent: BehaviourEventCallback,
): Promise<{
  result: Awaited<ReturnType<typeof findTargetOnCurrentPage>>;
  pagesSearched: number;
}> {
  for (let serpPage = 1; serpPage <= maxSerpPages; serpPage += 1) {
    await inspectSerp(page, persona, traits, onEvent);
    const result = await findTargetOnCurrentPage(page, targetDomain, serpPage);
    if (result) {
      return { result, pagesSearched: serpPage };
    }

    if (serpPage >= maxSerpPages) {
      break;
    }

    const hasNext = await goToNextSerpPage(page);
    if (!hasNext) {
      break;
    }
  }

  return { result: null, pagesSearched: maxSerpPages };
}

export async function runSearchJourney(
  input: SearchJourneyInput,
): Promise<SearchJourneyResult> {
  const {
    page,
    persona: inputPersona,
    traits,
    cluster,
    initialQuery,
    targetDomain,
    targetUrl,
    maxSerpPages,
    behaviourOverrides,
    onEvent,
  } = input;

  const persona = isDryRun() ? FAST_DRY_RUN_PERSONA : inputPersona;
  const probabilistic = isProbabilisticBehaviourEnabled();
  const allowReformulation = behaviourOverrides?.allowQueryReformulation ?? true;
  const allowAbandon = behaviourOverrides?.allowSearchAbandon ?? true;
  const allowTargetSkip = behaviourOverrides?.allowTargetSkip ?? true;
  let targetPath = "/";
  if (targetUrl) {
    try {
      targetPath = new URL(targetUrl).pathname || "/";
    } catch {
      targetPath = "/";
    }
  }

  const attempts: SearchAttempt[] = [];
  const usedQueries = new Set<string>();
  let currentQuery = initialQuery;
  let googleLoaded = false;
  let searchSubmitted = false;
  let openedGoogle = false;

  for (let searchIndex = 0; searchIndex < persona.maxSearchesPerSession; searchIndex += 1) {
    if (isDryRun() && searchIndex === 0) {
      await loadDryRunSerp(page, targetDomain, currentQuery.query, targetPath);
      googleLoaded = true;
      searchSubmitted = true;
      await onEvent("google_loaded");
      await onEvent("search_submitted", { query: currentQuery.query, attempt: searchIndex + 1 });
      await onEvent("serp_loaded");
    } else if (isDryRun()) {
      await typeAndSubmitQuery(page, currentQuery.query, persona, traits);
      searchSubmitted = true;
      await onEvent("search_submitted", { query: currentQuery.query, attempt: searchIndex + 1 });
      await onEvent("serp_loaded");
    } else {
      if (!openedGoogle) {
        await openGoogle(page);
        googleLoaded = true;
        openedGoogle = true;
        await onEvent("google_loaded");

        const blocked = await checkBlocked(page);
        if (blocked.blocked) {
          return {
            status: "blocked",
            googleLoaded,
            searchSubmitted: false,
            targetFound: false,
            targetClicked: false,
            targetSkipped: false,
            searches: attempts,
            blockReason: blocked.reason,
          };
        }
      }

      await typeAndSubmitQuery(page, currentQuery.query, persona, traits);
      searchSubmitted = true;
      await onEvent("search_submitted", { query: currentQuery.query, attempt: searchIndex + 1 });
      await onEvent("serp_loaded");

      const blocked = await checkBlocked(page);
      if (blocked.blocked) {
        return {
          status: "blocked",
          googleLoaded,
          searchSubmitted,
          targetFound: false,
          targetClicked: false,
          targetSkipped: false,
          searches: attempts,
          blockReason: blocked.reason,
        };
      }
    }

    if (
      probabilistic &&
      shouldAbandonBeforeInspect(persona, traits, allowAbandon)
    ) {
      attempts.push({
        queryText: currentQuery.query,
        queryType: currentQuery.queryType,
        targetFound: false,
        clicked: false,
        abandoned: true,
      });
      await onEvent("search_abandoned", { query: currentQuery.query });
      return {
        status: "search_abandoned",
        googleLoaded,
        searchSubmitted,
        targetFound: false,
        targetClicked: false,
        targetSkipped: false,
        searches: attempts,
      };
    }

    const { result, pagesSearched } = await findTargetWithInspection(
      page,
      targetDomain,
      maxSerpPages,
      persona,
      traits,
      onEvent,
    );

    if (result) {
      await onEvent("target_found", {
        position: result.position,
        serpPage: result.serpPage,
        attempt: searchIndex + 1,
        hrefKind: result.hrefKind,
        displayedUrl: result.displayedUrl,
      });

      const clickTarget = !probabilistic || shouldClickTarget(persona, traits, allowTargetSkip);
      if (!clickTarget) {
        attempts.push({
          queryText: currentQuery.query,
          queryType: currentQuery.queryType,
          targetFound: true,
          clicked: false,
          abandoned: false,
          serpPage: result.serpPage,
          position: result.position,
        });
        await onEvent("target_skipped", {
          position: result.position,
          serpPage: result.serpPage,
        });

        if (
          probabilistic &&
          allowReformulation &&
          searchIndex + 1 < persona.maxSearchesPerSession &&
          shouldReformulate(persona, traits)
        ) {
          usedQueries.add(currentQuery.query);
          const nextQuery = pickReformulatedQuery(currentQuery, cluster, usedQueries);
          if (nextQuery) {
            await onEvent("query_reformulated", {
              from: currentQuery.query,
              to: nextQuery.query,
            });
            currentQuery = nextQuery;
            continue;
          }
        }

        return {
          status: "target_found_no_click",
          googleLoaded,
          searchSubmitted,
          targetFound: true,
          targetClicked: false,
          targetSkipped: true,
          searches: attempts,
          serpPage: result.serpPage,
          observedPosition: result.position,
          resultTitle: result.title,
          resultUrl: result.url,
        };
      }

      await clickSerpResult(page, result);
      const landingUrl = page.url();
      await onEvent("target_clicked", {
        url: result.url,
        title: result.title,
        hrefKind: result.hrefKind,
        landingUrl,
      });

      attempts.push({
        queryText: currentQuery.query,
        queryType: currentQuery.queryType,
        targetFound: true,
        clicked: true,
        abandoned: false,
        serpPage: result.serpPage,
        position: result.position,
      });

      return {
        status: "completed",
        googleLoaded,
        searchSubmitted,
        targetFound: true,
        targetClicked: true,
        targetSkipped: false,
        searches: attempts,
        serpPage: result.serpPage,
        observedPosition: result.position,
        resultTitle: result.title,
        resultUrl: result.url,
        landingUrl,
      };
    }

    attempts.push({
      queryText: currentQuery.query,
      queryType: currentQuery.queryType,
      targetFound: false,
      clicked: false,
      abandoned: false,
      serpPage: pagesSearched,
    });

    usedQueries.add(currentQuery.query);

    if (
      probabilistic &&
      allowReformulation &&
      searchIndex + 1 < persona.maxSearchesPerSession &&
      shouldReformulate(persona, traits)
    ) {
      const nextQuery = pickReformulatedQuery(currentQuery, cluster, usedQueries);
      if (nextQuery) {
        await onEvent("query_reformulated", {
          from: currentQuery.query,
          to: nextQuery.query,
        });
        currentQuery = nextQuery;
        continue;
      }
    }

    break;
  }

  return {
    status: "target_not_found",
    googleLoaded,
    searchSubmitted,
    targetFound: false,
    targetClicked: false,
    targetSkipped: false,
    searches: attempts,
  };
}
