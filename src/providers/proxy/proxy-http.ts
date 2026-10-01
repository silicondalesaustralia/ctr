import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import type { ProxyLease } from "./ProxyProvider.js";

const DEFAULT_TIMEOUT_MS = 15_000;

function proxyAuth(lease: ProxyLease): string {
  return `Basic ${Buffer.from(`${lease.username}:${lease.password}`).toString("base64")}`;
}

function readJson(response: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if ((response.statusCode ?? 0) >= 400) {
      response.resume();
      reject(new Error(`HTTP ${response.statusCode}`));
      return;
    }
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("error", reject);
    response.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

function plainHttp(lease: ProxyLease, url: URL, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: lease.host,
      port: lease.port,
      method: "GET",
      path: url.toString(),
      headers: { Host: url.host, Accept: "application/json", "Proxy-Authorization": proxyAuth(lease) },
      timeout: timeoutMs,
    });
    request.on("response", (response) => readJson(response).then(resolve, reject));
    request.on("timeout", () => request.destroy(new Error(`proxy request timed out after ${timeoutMs}ms`)));
    request.on("error", reject);
    request.end();
  });
}

function tunnelledHttps(lease: ProxyLease, url: URL, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const port = url.port || "443";
    const connect = http.request({
      host: lease.host,
      port: lease.port,
      method: "CONNECT",
      path: `${url.hostname}:${port}`,
      headers: { Host: `${url.hostname}:${port}`, "Proxy-Authorization": proxyAuth(lease) },
      timeout: timeoutMs,
    });
    connect.on("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`proxy CONNECT returned ${response.statusCode}`));
        return;
      }
      const request = https.request({
        host: url.hostname,
        path: `${url.pathname}${url.search}`,
        headers: { Accept: "application/json" },
        timeout: timeoutMs,
        createConnection: () => tls.connect({ socket, servername: url.hostname }),
      });
      request.on("response", (res) => readJson(res).then(resolve, reject));
      request.on("timeout", () => request.destroy(new Error(`proxy request timed out after ${timeoutMs}ms`)));
      request.on("error", reject);
      request.end();
    });
    connect.on("timeout", () => connect.destroy(new Error(`proxy CONNECT timed out after ${timeoutMs}ms`)));
    connect.on("error", reject);
    connect.end();
  });
}

/** GET a JSON endpoint through the lease's proxy, without launching a browser. */
export function fetchJsonViaProxy(
  lease: ProxyLease,
  target: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const url = new URL(target);
  return url.protocol === "https:" ? tunnelledHttps(lease, url, timeoutMs) : plainHttp(lease, url, timeoutMs);
}
