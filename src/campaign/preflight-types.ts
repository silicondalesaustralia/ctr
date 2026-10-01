import type { LocalPackSource } from "../browser/local-pack-match.js";

/** `limited`: Google ran out of results before the page limit, so absence is inconclusive. */
export type PreflightQueryStatus = "found" | "not_found" | "limited" | "blocked" | "error";

export interface PreflightQueryResult {
  query: string;
  found: boolean;
  serpPage: number | null;
  position: number | null;
  globalPosition: number | null;
  status: PreflightQueryStatus;
  errorMessage?: string;
  /** GMB only: where the listing was matched. */
  source?: LocalPackSource;
}

export type PreflightSummaryStatus = "complete" | "none_found" | "blocked" | "error";

export interface PreflightSummary {
  status: PreflightSummaryStatus;
  testedCount: number;
  findableCount: number;
  keywordAdjusted: boolean;
  previousKeyword: string;
  results: PreflightQueryResult[];
}
