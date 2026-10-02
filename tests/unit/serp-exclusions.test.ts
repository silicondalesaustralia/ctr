import { describe, expect, it } from "vitest";
import { isNonOrganicHeading } from "../../src/browser/serp-exclusions.js";

describe("isNonOrganicHeading", () => {
  it("flags SERP feature headings", () => {
    for (const heading of ["Places", "Sponsored", "Popular products", "People also ask", "Top stories", "Videos", "Discussions and forums"]) {
      expect(isNonOrganicHeading(heading)).toBe(true);
    }
  });

  it("keeps organic section headings", () => {
    for (const heading of ["Search Results", "Web results", "Phone Shops in Town End - Yorkshire.com"]) {
      expect(isNonOrganicHeading(heading)).toBe(false);
    }
  });
});
