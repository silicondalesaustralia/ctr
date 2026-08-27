import { describe, expect, it } from "vitest";
import {
  buildCloudConnectUrl,
  isValidGoLoginProfileId,
  normalizeWsEndpoint,
  resolveConnectUrl,
} from "../../src/providers/browser/gologin-utils.js";

describe("gologin connect URL helpers", () => {
  it("validates GoLogin profile IDs", () => {
    expect(isValidGoLoginProfileId("6a8fa281e28f16956d8d55a1")).toBe(true);
    expect(isValidGoLoginProfileId("00296b5f-a56b-4d72-8e2d-f203e5a23faf")).toBe(false);
    expect(isValidGoLoginProfileId(null)).toBe(false);
  });

  it("builds a wss cloud connect URL", () => {
    const url = buildCloudConnectUrl("profile-123", "token-abc");
    expect(url).toBe(
      "wss://cloudbrowser.gologin.com/connect?token=token-abc&profile=profile-123",
    );
  });

  it("normalizes https connect URLs to wss", () => {
    expect(normalizeWsEndpoint("https://cloudbrowser.gologin.com/connect?x=1")).toBe(
      "wss://cloudbrowser.gologin.com/connect?x=1",
    );
  });

  it("prefers wsUrl from the GoLogin POST response", () => {
    const url = resolveConnectUrl(
      { wsUrl: "https://cloudbrowser.gologin.com/connect?token=t&profile=p" },
      "fallback-profile",
      "fallback-token",
    );
    expect(url).toBe("wss://cloudbrowser.gologin.com/connect?token=t&profile=p");
  });

  it("falls back to the built connect URL when POST returns no endpoint", () => {
    const url = resolveConnectUrl({}, "profile-123", "token-abc");
    expect(url).toBe(
      "wss://cloudbrowser.gologin.com/connect?token=token-abc&profile=profile-123",
    );
  });
});
