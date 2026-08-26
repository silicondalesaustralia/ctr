export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  country: string;
  region?: string;
  city?: string;
  sessionKey?: string;
}

export interface ProxyLease {
  leaseId: string;
  host: string;
  port: number;
  username: string;
  password: string;
  country: "AU";
  region?: string;
  city?: string;
  sessionKey?: string;
}

export interface ProxyAllocationRequest {
  country: string;
  region?: string;
  city?: string;
  sessionKey?: string;
}

export interface ProxyProvider {
  allocate(input: ProxyAllocationRequest): Promise<ProxyLease>;
  release(leaseId: string): Promise<void>;
}
