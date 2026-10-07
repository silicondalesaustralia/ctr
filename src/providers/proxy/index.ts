import { getEnv } from "../../config/env.js";
import { BrightDataProxyProvider } from "./BrightDataProvider.js";
import { DecodoProxyProvider } from "./DecodoProvider.js";
import { DeviceRoutedProxyProvider } from "./DeviceRoutedProxyProvider.js";
import { MockProxyProvider } from "./MockProxyProvider.js";
import { OxylabsProxyProvider } from "./OxylabsProvider.js";
import { PremiumPortsProxyProvider } from "./PremiumPortsProvider.js";
import type { ProxyProvider } from "./ProxyProvider.js";
import { SoaxProxyProvider } from "./SoaxProvider.js";

export type ProxyProviderName = ReturnType<typeof getEnv>["PROXY_PROVIDER"];

export function createNamedProxyProvider(name: ProxyProviderName): ProxyProvider {
  switch (name) {
    case "decodo":
      return new DecodoProxyProvider();
    case "premiumports":
      return new PremiumPortsProxyProvider();
    case "oxylabs":
      return new OxylabsProxyProvider();
    case "brightdata":
      return new BrightDataProxyProvider();
    case "soax":
      return new SoaxProxyProvider();
    case "mock":
      return new MockProxyProvider();
  }
}

export function createProxyProvider(): ProxyProvider {
  const env = getEnv();
  const desktop = createNamedProxyProvider(env.PROXY_PROVIDER);
  if (!env.MOBILE_PROXY_PROVIDER || env.MOBILE_PROXY_PROVIDER === env.PROXY_PROVIDER) return desktop;
  return new DeviceRoutedProxyProvider(desktop, createNamedProxyProvider(env.MOBILE_PROXY_PROVIDER));
}

/** Provider name a lease for this device class comes from (for session records). */
export function proxyProviderNameFor(deviceClass: string): ProxyProviderName {
  const env = getEnv();
  return deviceClass === "mobile" && env.MOBILE_PROXY_PROVIDER ? env.MOBILE_PROXY_PROVIDER : env.PROXY_PROVIDER;
}
