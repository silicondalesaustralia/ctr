import { describe, expect, it } from "vitest";
import { matchCandidate, namesMatch } from "../../src/browser/local-pack-match.js";

const target = "McLennan Plumbing & Gas";

function candidate(title: string, ids: { placeId?: string; cid?: string } = {}) {
  return { title, href: "", placeId: ids.placeId ?? null, cid: ids.cid ?? null };
}

describe("namesMatch (strict)", () => {
  it("accepts the full name with extra listing text", () => {
    expect(namesMatch("McLennan Plumbing & Gas 5.0 (42)", target)).toBe(true);
    expect(namesMatch("Adelaide Equine Clinic - Vet", "Adelaide Equine Clinic")).toBe(true);
  });

  it("accepts a listing that drops a legal suffix", () => {
    expect(namesMatch("McLennan Plumbing & Gas", "McLennan Plumbing & Gas Pty Ltd")).toBe(true);
  });

  it("rejects fragments and labels that only share a word", () => {
    expect(namesMatch("Plumbing", target)).toBe(false);
    expect(namesMatch("Gas", target)).toBe(false);
    expect(namesMatch("Plumbing & Gas", target)).toBe(false);
    expect(namesMatch("Mount Barker Plumbing", target)).toBe(false);
  });

  it("matches on whole words, not substrings", () => {
    expect(namesMatch("Vegas Plumbing McLennanville", target)).toBe(false);
  });
});

describe("matchCandidate", () => {
  it("counts position across competitors", () => {
    const list = [candidate("Barker Plumbing"), candidate("Hills Gas Fitters"), candidate(target)];
    expect(matchCandidate(list, { businessName: target }, "more_places")?.position).toBe(3);
  });

  it("prefers a CID match over an earlier name match", () => {
    const list = [candidate("McLennan Plumbing & Gas"), candidate("McLennan P&G", { cid: "123456789" })];
    const found = matchCandidate(list, { businessName: target, placeId: "cid:123456789" }, "local_pack");
    expect(found?.position).toBe(2);
  });

  it("applies the page offset", () => {
    const found = matchCandidate([candidate(target)], { businessName: target }, "more_places", 20);
    expect(found?.position).toBe(21);
  });
});
