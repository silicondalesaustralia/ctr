import { describe, expect, it } from "vitest";
import { ipPrefix, reputationKey } from "../../src/providers/proxy/ip-reputation.js";
import { classifyBrowserErrorCode } from "../../src/scheduler/retry-policy.js";

describe("ip reputation", () => {
  it("buckets IPv4 by /24 and IPv6 by /48", () => {
    expect(ipPrefix("179.61.200.14")).toBe("179.61.200");
    expect(ipPrefix("2001:db8:abcd:12::1")).toBe("2001:db8:abcd");
    expect(ipPrefix("not-an-ip")).toBeNull();
  });

  it("keys mobile egress by exact IP, fixed lines by prefix", () => {
    expect(reputationKey("1.145.20.7")).toBe("1.145.20");
    expect(reputationKey("1.145.20.7", true)).toBe("1.145.20.7");
    expect(reputationKey("2001:8004:ABCD:12::1", true)).toBe("2001:8004:abcd:12::1");
    expect(reputationKey("not-an-ip", true)).toBeNull();
  });

  it("treats a flagged prefix as a proxy_error retry", () => {
    expect(
      classifyBrowserErrorCode("Proxy egress IP prefix flagged: prefix=179.61.200 ip=179.61.200.14"),
    ).toBe("proxy_error");
  });
});
