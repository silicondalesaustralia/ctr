export interface GoLoginStartResponse {
  wsUrl?: string;
  ws?: string;
  url?: string;
}

export function buildCloudConnectUrl(profileId: string, apiToken: string): string {
  return `wss://cloudbrowser.gologin.com/connect?token=${encodeURIComponent(apiToken)}&profile=${encodeURIComponent(profileId)}`;
}

export function normalizeWsEndpoint(url: string): string {
  if (url.startsWith("wss://") || url.startsWith("ws://")) {
    return url;
  }
  if (url.startsWith("https://")) {
    return url.replace("https://", "wss://");
  }
  if (url.startsWith("http://")) {
    return url.replace("http://", "ws://");
  }
  return url;
}

export function resolveConnectUrl(
  started: GoLoginStartResponse,
  profileId: string,
  apiToken: string,
): string {
  const fromApi = started.wsUrl ?? started.ws ?? started.url;
  return normalizeWsEndpoint(fromApi ?? buildCloudConnectUrl(profileId, apiToken));
}
