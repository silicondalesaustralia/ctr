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
}

export interface ProxyProvider {
  allocate(input: ProxyAllocationRequest): Promise<ProxyLease>;
  release(leaseId: string): Promise<void>;
}
