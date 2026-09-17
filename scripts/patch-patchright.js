#!/usr/bin/env node
/**
 * Patchright BrowserContext.installInjectRoute incorrectly calls this.context()
 * (a Page API). That throws "this.context is not a function" on addInitScript.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function resolveBrowserContextJs() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "node_modules", "patchright-core", "lib", "client", "browserContext.js"),
    join(process.cwd(), "node_modules", "patchright-core", "lib", "client", "browserContext.js"),
  ];
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("patchright-core");
    candidates.unshift(join(dirname(entry), "lib", "client", "browserContext.js"));
  } catch {
    /* ignore */
  }
  return candidates.find((path) => existsSync(path));
}

function main() {
  const target = resolveBrowserContextJs();
  if (!target) {
    console.error("[patch-patchright] patchright-core not installed — skip");
    return;
  }

  let text = readFileSync(target, "utf8");
  const broken =
    "if (this.routeInjecting || this.context().routeInjecting) return;";
  const fixed = "if (this.routeInjecting) return;";
  if (!text.includes(broken)) {
    if (text.includes(fixed)) {
      console.error("[patch-patchright] already applied");
      return;
    }
    console.error("[patch-patchright] expected snippet not found — skip");
    return;
  }

  text = text.replace(broken, fixed);
  writeFileSync(target, text);
  console.error("[patch-patchright] fixed BrowserContext.installInjectRoute");
}

main();
