import { describe, expect, it } from "vitest";
import {
  isLocalFinderPage,
  localFinderUrl,
  namesMatch,
} from "../../src/browser/local-pack.js";

describe("localFinderUrl", () => {
  it("builds udm=1 AU local finder URL", () => {
    expect(localFinderUrl("plumber Mount Barker")).toBe(
      "https://www.google.com.au/search?q=plumber%20Mount%20Barker&udm=1&hl=en-AU&gl=au",
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
});

describe("namesMatch", () => {
  it("matches McLennan style titles", () => {
    expect(namesMatch("McLennan Plumbing & Gas", "McLennan Plumbing & Gas")).toBe(true);
    expect(namesMatch("McLennan Plumbing & Gas 5.0", "McLennan Plumbing & Gas")).toBe(true);
  });
});
