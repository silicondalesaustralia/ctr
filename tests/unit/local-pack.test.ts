import { describe, expect, it } from "vitest";
import {
  isLocalFinderPage,
  localFinderUrl,
  namesMatch,
} from "../../src/browser/local-pack.js";
import { googleTargetFor } from "../../src/geo/google-target.js";

describe("localFinderUrl", () => {
  it("builds udm=1 AU local finder URL", () => {
    expect(localFinderUrl("plumber Mount Barker")).toBe(
      "https://www.google.com/search?q=plumber%20Mount%20Barker&udm=1&hl=en-AU&gl=au",
    );
  });

  it("uses the identity country's gl/hl", () => {
    expect(localFinderUrl("plumber Denver", googleTargetFor("US", "en-US"))).toBe(
      "https://www.google.com/search?q=plumber%20Denver&udm=1&hl=en-US&gl=us",
    );
  });
});

describe("isLocalFinderPage", () => {
  it("detects udm=1 pages", () => {
    expect(
      isLocalFinderPage(
        "https://www.google.com/search?q=plumber+mount+barker&udm=1&hl=en-AU",
      ),
    ).toBe(true);
    expect(isLocalFinderPage("https://www.google.com/search?q=plumber&gbv=2")).toBe(false);
  });

  it("detects the udm=local page reached from 'More businesses'", () => {
    expect(
      isLocalFinderPage(
        "https://www.google.com/search?q=plumber+mount+barker&hl=en-AU&gl=au&udm=local&lsack=abc",
      ),
    ).toBe(true);
    expect(isLocalFinderPage("https://www.google.com/search?q=udm%3Dlocalish")).toBe(false);
  });
});

describe("namesMatch", () => {
  it("matches McLennan style titles", () => {
    expect(namesMatch("McLennan Plumbing & Gas", "McLennan Plumbing & Gas")).toBe(true);
    expect(namesMatch("McLennan Plumbing & Gas 5.0", "McLennan Plumbing & Gas")).toBe(true);
  });
});

describe("mapsSearchUrl", () => {
  it("builds AU maps search URL", async () => {
    const { mapsSearchUrl } = await import("../../src/browser/local-pack.js");
    expect(mapsSearchUrl("plumber Mount Barker")).toContain(
      "www.google.com/maps/search/plumber%20Mount%20Barker?hl=en-AU",
    );
  });
});
