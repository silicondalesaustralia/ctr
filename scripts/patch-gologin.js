#!/usr/bin/env node
/**
 * Patch gologin SDK so local Orbita + authenticated proxies work:
 * 1) host-resolver excludes localhost (CDP)
 * 2) honor browserMajorVersion >=135 (proxy auth in preferences)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function main() {
  let target;
  try {
    target = require.resolve("gologin/src/gologin.js");
  } catch {
    console.error("[patch-gologin] gologin not installed — skip");
    return;
  }

  let text = readFileSync(target, "utf8");
  let changed = false;

  const hrOld =
    'const hr_rules = `"MAP * 0.0.0.0 , EXCLUDE ${proxy_host} , EXCLUDE api.gologin.com"`;';
  const hrNew =
    'const hr_rules = `"MAP * 0.0.0.0 , EXCLUDE ${proxy_host} , EXCLUDE api.gologin.com , EXCLUDE 127.0.0.1 , EXCLUDE localhost"`;';
  if (text.includes(hrOld)) {
    text = text.replace(hrOld, hrNew);
    changed = true;
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

  if (!changed) {
    console.error("[patch-gologin] already applied or patterns missing");
    return;
  }

  writeFileSync(target, text);
  console.error(`[patch-gologin] patched ${target}`);
}

main();
