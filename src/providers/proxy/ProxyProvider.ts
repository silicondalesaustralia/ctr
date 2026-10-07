export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  country: string;
  region?: string;
  city?: string;
  sessionKey?: string;
  /** Profile timezone. Avoids a GoLogin GET that has been timing out. */
  timezone?: string;
  /** Identity locale (e.g. en-GB) for the browser's language settings. */
  locale?: string;
}

export interface ProxyLease {
  leaseId: string;
  host: string;
  port: number;
  username: string;
  password: string;
  /** ISO country code, upper case. */
  country: string;
  region?: string;
  city?: string;
  sessionKey?: string;
  proxyType?: "residential" | "mobile";
}

export interface ProxyAllocationRequest {
  country: string;
  region?: string;
  city?: string;
  sessionKey?: string;
  deviceClass?: "desktop" | "mobile";
  /** Restrict to one network (e.g. 1221 = Telstra), where the provider supports it. */
  asn?: number;
  /** Restrict to one carrier by the provider's ISP code (e.g. SOAX "telstra_internet"). */
  isp?: string;
}

export interface ProxyProvider {
  allocate(input: ProxyAllocationRequest): Promise<ProxyLease>;
  release(leaseId: string): Promise<void>;
}
