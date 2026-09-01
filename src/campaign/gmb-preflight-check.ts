import type { Page } from "playwright";
import { findGmbInLocalPack } from "../browser/local-pack.js";
import {
  checkBlocked,
  openGoogle,
  typeAndSubmitQuery,
} from "../browser/google-search.js";
import { isDryRun } from "../config/env.js";
import { FAST_DRY_RUN_PERSONA } from "../behaviour/personas.js";
import { generateSessionTraits } from "../behaviour/session-traits.js";
import type { PreflightQueryResult } from "./preflight-types.js";

export async function checkGmbQueryOnPage(
  page: Page,
  query: string,
  businessName: string,
  placeId?: string | null,
): Promise<PreflightQueryResult> {
  try {
    if (isDryRun()) {
      return {
        query,
        found: true,
        serpPage: 1,
        position: 1,
        globalPosition: 1,
        status: "found",
      };
    }

    await openGoogle(page);
    const blockedAfterOpen = await checkBlocked(page);
    if (blockedAfterOpen.blocked) {
      return {
        query,
        found: false,
        serpPage: null,
        position: null,
        globalPosition: null,
        status: "blocked",
        errorMessage: blockedAfterOpen.reason,
      };
    }

    const persona = FAST_DRY_RUN_PERSONA;
    const traits = generateSessionTraits(persona, `gmb-preflight-${Date.now()}`, "preflight");
    await typeAndSubmitQuery(page, query, persona, traits);

    const blockedAfterSearch = await checkBlocked(page);
    if (blockedAfterSearch.blocked) {
      return {
        query,
        found: false,
        serpPage: null,
        position: null,
        globalPosition: null,
        status: "blocked",
        errorMessage: blockedAfterSearch.reason,
      };
    }

    const found = await findGmbInLocalPack(page, { businessName, placeId, query });
    if (!found) {
      return {
        query,
        found: false,
        serpPage: 1,
        position: null,
        globalPosition: null,
        status: "not_found",
      };
    }

    return {
      query,
      found: true,
      serpPage: 1,
      position: found.position,
      globalPosition: found.position,
      status: "found",
      source: found.source,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      query,
      found: false,
      serpPage: null,
      position: null,
      globalPosition: null,
      status: "error",
      errorMessage: message,
    };
  }
}
