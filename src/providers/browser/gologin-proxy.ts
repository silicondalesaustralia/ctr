import type { ProxyConfig } from "../proxy/ProxyProvider.js";

type GoLoginProxyState = {
  mode?: string;
  host?: string;
  port?: number;
  username?: string;
  id?: string;
};

type GlRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * Persist Decodo as a GoLogin proxy entity and attach it by id.
 * Inline-only credential patches are stored but not used by cloud browsers.
 */
export async function applyDecodoProxyToProfile(
  request: GlRequest,
  profileId: string,
  proxy: ProxyConfig,
): Promise<void> {
  console.error(
    `[gologin] Updating proxy on ${profileId} → ${proxy.host}:${proxy.port} user=${proxy.username.slice(0, 36)}…`,
  );

  const proxyPayload = {
    mode: "http" as const,
    host: proxy.host,
    port: Number(proxy.port),
    username: proxy.username,
    password: proxy.password,
    customName: `decodo-${proxy.sessionKey ?? profileId}`.slice(0, 60),
  };

  const created = await request<Array<{ id?: string; _id?: string }>>(
    "/proxy/add_proxies",
    {
      method: "POST",
      body: JSON.stringify({ proxies: [proxyPayload] }),
    },
  );
  const proxyId = created[0]?.id ?? created[0]?._id;
  if (!proxyId) {
    throw new Error("GoLogin add_proxies returned no proxy id");
  }

  await request(`/browser/proxy/many/v2`, {
    method: "PATCH",
    body: JSON.stringify({
      // Include full credentials (not id-only). Orbita local spawn needs host/port;
      // id-only links hydrate in the dashboard API but download as undefined locally.
      proxies: [{ profileId, proxy: { ...proxyPayload, id: proxyId } }],
    }),
  });
  console.error(`[gologin] Proxy entity ${proxyId.slice(0, 8)}… linked to ${profileId}`);

  const verified = await request<{ proxy?: GoLoginProxyState }>(`/browser/${profileId}`);
  const applied = verified.proxy;
  const mode = typeof applied?.mode === "string" ? applied.mode : String(applied?.mode ?? "");
  const host = applied?.host ?? "";
  const username = applied?.username ?? "";

  console.error(
    `[gologin] Proxy readback mode=${mode || "none"} host=${host || "none"} user=${username.slice(0, 36) || "none"}…`,
  );

  if (mode !== "http" || host !== proxy.host) {
    throw new Error(
      `GoLogin proxy not applied for ${profileId}: mode=${mode || "none"} host=${host || "none"}`,
    );
  }
  if (!username || username !== proxy.username) {
    throw new Error(
      `GoLogin proxy username mismatch for ${profileId}: expected sticky Decodo user, got ${username.slice(0, 48) || "empty"}`,
    );
  }
}
