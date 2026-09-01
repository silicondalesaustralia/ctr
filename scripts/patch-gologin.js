#!/usr/bin/env node
/**
 * Patch gologin SDK for Railway Orbita + Decodo:
 * 1) do not sinkhole DNS with MAP * 0.0.0.0 (breaks geo + Google through HTTP proxy)
 * 2) honor browserMajorVersion >=135
 * 3) never inject bare --proxy-server without credentials
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function resolveGoLoginSrc() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "node_modules", "gologin", "src", "gologin.js"),
    join(process.cwd(), "node_modules", "gologin", "src", "gologin.js"),
  ];
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("gologin");
    candidates.unshift(join(dirname(entry), "gologin.js"));
    candidates.unshift(join(dirname(entry), "..", "src", "gologin.js"));
  } catch {
    /* ignore */
  }
  return candidates.find((path) => existsSync(path));
}

function main() {
  const target = resolveGoLoginSrc();
  if (!target) {
    console.error("[patch-gologin] gologin not installed — skip");
    return;
  }

  let text = readFileSync(target, "utf8");
  let changed = false;

  // Disable DNS sinkhole entirely (MAP * breaks in-page fetch via HTTP proxy).
  const hrBlockOld =
    "      if (proxy) {\n" +
    '        const hr_rules = `"MAP * 0.0.0.0 , EXCLUDE ${proxy_host} , EXCLUDE api.gologin.com , EXCLUDE 127.0.0.1 , EXCLUDE localhost"`;\n' +
    "        params.push(`--host-resolver-rules=${hr_rules}`);\n" +
    "      }";
  const hrBlockOldUnpatched =
    "      if (proxy) {\n" +
    '        const hr_rules = `"MAP * 0.0.0.0 , EXCLUDE ${proxy_host} , EXCLUDE api.gologin.com"`;\n' +
    "        params.push(`--host-resolver-rules=${hr_rules}`);\n" +
    "      }";
  const hrBlockNew =
    "      // CTR: skip host-resolver DNS sinkhole — it breaks geo/Google with HTTP proxies.\n" +
    "      if (false && proxy) {\n" +
    '        const hr_rules = `"MAP * 0.0.0.0 , EXCLUDE ${proxy_host} , EXCLUDE api.gologin.com"`;\n' +
    "        params.push(`--host-resolver-rules=${hr_rules}`);\n" +
    "      }";
  if (text.includes(hrBlockOld)) {
    text = text.replace(hrBlockOld, hrBlockNew);
    changed = true;
  } else if (text.includes(hrBlockOldUnpatched)) {
    text = text.replace(hrBlockOldUnpatched, hrBlockNew);
    changed = true;
  } else if (!text.includes("CTR: skip host-resolver DNS sinkhole")) {
    console.error("[patch-gologin] host-resolver block not found");
  }

  const resolveOld =
    "  async resolveProfileBrowserVersion(profile) {\n    if (!this.executablePath) {";
  const resolveNew = `  async resolveProfileBrowserVersion(profile) {
    // Keep caller-pinned major versions (e.g. 135+) so authenticated proxy prefs apply.
    if (this.browserMajorVersion >= this.newProxyOrbitaMajorVersion) {
      if (!this.executablePath) {
        await this.checkBrowser(String(this.browserMajorVersion));
      }
      return;
    }
    if (!this.executablePath) {`;
  if (text.includes(resolveOld) && !text.includes("Keep caller-pinned major versions")) {
    text = text.replace(resolveOld, resolveNew);
    changed = true;
  }

  const bareProxyOld =
    "      if (proxy && Number(this.browserMajorVersion) < this.newProxyOrbitaMajorVersion) {\n        params.push(`--proxy-server=${proxy}`);\n      }";
  const bareProxyNew =
    "      // CTR: skip bare --proxy-server (no auth). Caller supplies authenticated --proxy-server via extra_params.\n      if (false && proxy && Number(this.browserMajorVersion) < this.newProxyOrbitaMajorVersion) {\n        params.push(`--proxy-server=${proxy}`);\n      }";
  if (text.includes(bareProxyOld)) {
    text = text.replace(bareProxyOld, bareProxyNew);
    changed = true;
  } else if (!text.includes("CTR: skip bare --proxy-server")) {
    console.error("[patch-gologin] bare --proxy-server pattern not found");
  }

  if (!changed) {
    console.error("[patch-gologin] already applied or patterns missing");
    return;
  }

  writeFileSync(target, text);
  console.error(`[patch-gologin] patched ${target}`);
}

main();
