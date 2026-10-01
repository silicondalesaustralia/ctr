import { describe, expect, it } from "vitest";
import {
  classifyBrowserErrorCode,
  getRetryDelayMinutes,
  mapErrorStatus,
  shouldRetry,
} from "../../src/scheduler/retry-policy.js";
import { ProxyPoolExhaustedError } from "../../src/sessions/clean-lease.js";

describe("proxy pool exhausted retry policy", () => {
  const message = new ProxyPoolExhaustedError("Brisbane", "Proxy egress geo mismatch").message;

  it("is deferred as cancelled, not recorded as a proxy failure", () => {
    const code = classifyBrowserErrorCode(message);
    expect(code).toBe("proxy_pool_exhausted");
    expect(mapErrorStatus(code)).toBe("cancelled");
  });

  it("keeps retrying every 30 minutes", () => {
    expect(shouldRetry("proxy_pool_exhausted", 50)).toBe(true);
    expect(getRetryDelayMinutes("proxy_pool_exhausted")).toBe(30);
  });

  it("still classifies a single bad lease as a proxy error", () => {
    expect(classifyBrowserErrorCode("Proxy egress geo mismatch: expected AU, got PH/Naic ip=1.2.3.4")).toBe("proxy_error");
  });
});
