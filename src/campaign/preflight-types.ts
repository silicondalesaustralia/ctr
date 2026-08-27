export type PreflightQueryStatus = "found" | "not_found" | "blocked" | "error";

export interface PreflightQueryResult {
  query: string;
  found: boolean;
  serpPage: number | null;
  position: number | null;
  globalPosition: number | null;
  status: PreflightQueryStatus;
  errorMessage?: string;
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
