import { describe, expect, it } from "vitest";
import { namesMatch } from "../../src/browser/local-pack.js";
import { pickSecondaryAction } from "../../src/behaviour/gmb-actions.js";

describe("pickSecondaryAction", () => {
  it("returns null when only open_listing is enabled", () => {
    expect(pickSecondaryAction(["open_listing"])).toBeNull();
  });

  it("picks from secondary actions", () => {
    const pick = pickSecondaryAction(["open_listing", "call", "directions"]);
    expect(pick === "call" || pick === "directions").toBe(true);
  });
});

describe("namesMatch", () => {
  it("matches loose business titles", () => {
    expect(namesMatch("Adelaide Equine Clinic - Vet", "Adelaide Equine Clinic")).toBe(true);
  });
});

describe("CID place id parsing via namesMatch path", () => {
  it("matches McLennan style titles", () => {
    expect(namesMatch("McLennan Plumbing & Gas", "McLennan Plumbing & Gas")).toBe(true);
    expect(namesMatch("McLennan Plumbing & Gas 5.0", "McLennan Plumbing & Gas")).toBe(true);
  });
});
