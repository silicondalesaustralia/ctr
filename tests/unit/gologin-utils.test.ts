import { describe, expect, it } from "vitest";
import {
  buildCloudConnectUrl,
  normalizeWsEndpoint,
  resolveConnectUrl,
} from "../../src/providers/browser/gologin-utils.js";

describe("gologin connect URL helpers", () => {
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
