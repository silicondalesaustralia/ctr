import type { LocalPackCandidate } from "./local-pack-collect.js";

/**
 * Where a listing was matched. `branded_search` is a Maps search for the business's
 * own name — useful for reaching the listing, never a ranking.
 */
export type LocalPackSource = "local_pack" | "more_places" | "maps_keyword" | "branded_search";

export interface LocalPackResult {
  position: number;
  title: string;
  href: string;
  placeId: string | null;
  cid: string | null;
  source: LocalPackSource;
}

export interface LocalPackTarget {
  businessName: string;
  placeId?: string | null;
  cid?: string | null;
}

/** Listing titles may drop trailing words ("Pty Ltd") but must keep most of the name. */
const MIN_SHORTENED_NAME_SHARE = 0.6;
const MIN_SHORTENED_NAME_WORDS = 2;

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Word-level match: the listing contains every word of the business name, or is the
 * name with trailing words dropped. A fragment such as "Plumbing & Gas" never
 * matches "McLennan Plumbing & Gas".
 */
export function namesMatch(candidate: string, target: string): boolean {
  const listing = nameTokens(candidate);
  const business = nameTokens(target);
  if (listing.length === 0 || business.length === 0) return false;

  const listingSet = new Set(listing);
  if (business.every((word) => listingSet.has(word))) return true;

  return (
    listing.length >= MIN_SHORTENED_NAME_WORDS &&
    listing.length / business.length >= MIN_SHORTENED_NAME_SHARE &&
    listing.every((word, index) => business[index] === word)
  );
}

function parseTargetIds(target: LocalPackTarget): { placeId: string | null; cid: string | null } {
  const rawId = target.placeId?.trim() ?? "";
  const isCid = rawId.toLowerCase().startsWith("cid:") || /^\d{6,}$/.test(rawId);
  const cidFromId = isCid ? rawId.replace(/^cid:/i, "") : null;
  return {
    placeId: rawId && !isCid ? rawId : null,
    cid: (target.cid ?? cidFromId)?.replace(/^cid:/i, "") ?? null,
  };
}

/** An ID match wins over a name match anywhere in the list. */
export function matchCandidate(
  candidates: LocalPackCandidate[],
  target: LocalPackTarget,
  source: LocalPackSource,
  offset = 0,
): LocalPackResult | null {
  const ids = parseTargetIds(target);
  const toResult = (candidate: LocalPackCandidate, index: number): LocalPackResult => ({
    position: offset + index + 1,
    title: candidate.title,
    href: candidate.href,
    placeId: candidate.placeId,
    cid: candidate.cid,
    source,
  });

  const byId = candidates.findIndex(
    (candidate) =>
      (ids.placeId !== null && candidate.placeId === ids.placeId) ||
      (ids.cid !== null && candidate.cid === ids.cid),
  );
  if (byId >= 0) return toResult(candidates[byId]!, byId);

  const byName = candidates.findIndex((candidate) => namesMatch(candidate.title, target.businessName));
  return byName >= 0 ? toResult(candidates[byName]!, byName) : null;
}
