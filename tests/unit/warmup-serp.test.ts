import { describe, expect, it } from "vitest";
import { leadsOffGoogle } from "../../src/browser/warmup-serp.js";

describe("leadsOffGoogle", () => {
  it("keeps result links that go to other sites", () => {
    expect(leadsOffGoogle("/url?opi=89978449&q=https://betweenthevines.com.au/&sa=U")).toBe(true);
    expect(leadsOffGoogle("https://www.example.com.au/wineries")).toBe(true);
  });

  it("drops Google's own links from the mobile SERP", () => {
    expect(leadsOffGoogle("//support.google.com/websearch/answer/86640")).toBe(false);
    expect(leadsOffGoogle("/advanced_search")).toBe(false);
    expect(leadsOffGoogle("https://maps.google.com.au/maps?q=x")).toBe(false);
  });
});
