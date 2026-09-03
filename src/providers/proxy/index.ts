import { getEnv } from "../../config/env.js";
import { DecodoProxyProvider } from "./DecodoProvider.js";
import { MockProxyProvider } from "./MockProxyProvider.js";
import { PremiumPortsProxyProvider } from "./PremiumPortsProvider.js";
import type { ProxyProvider } from "./ProxyProvider.js";

export function createProxyProvider(): ProxyProvider {
  const env = getEnv();
  if (env.PROXY_PROVIDER === "decodo") {
    return new DecodoProxyProvider();
  }
  if (env.PROXY_PROVIDER === "premiumports") {
    return new PremiumPortsProxyProvider();
  }
  return new MockProxyProvider();
}
