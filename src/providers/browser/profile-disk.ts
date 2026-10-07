import { readdir, lstat, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getEnv } from "../../config/env.js";
import { prisma } from "../../db/client.js";

/** Rebuildable Firefox data; cookies, history and storage (the returning-visitor state) stay. */
const PRUNABLE_DIRS = [
  "cache2",
  "startupCache",
  "shader-cache",
  "thumbnails",
  "crashes",
  "minidumps",
  "datareporting",
  "saved-telemetry-pings",
];

/** Firefox prefs that stop the disk cache growing towards its ~1GB smart-size default. */
export const DISK_CACHE_PREFS: Record<string, boolean | number> = {
  "browser.cache.disk.smart_size.enabled": false,
  "browser.cache.disk.capacity": 51_200,
};

function profileRoot(): string {
  return resolve(getEnv().CAMOUFOX_PROFILE_DIR);
}

async function sizeOf(path: string): Promise<number> {
  const stat = await lstat(path).catch(() => null);
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;
  const entries = await readdir(path).catch(() => []);
  let total = 0;
  for (const entry of entries) total += await sizeOf(join(path, entry));
  return total;
}

function mb(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

/** Extension storage (uBlock Origin filter lists, ~35MB per profile); add-ons are excluded at launch. */
async function extensionStorageDirs(dir: string): Promise<string[]> {
  const storage = join(dir, "storage", "default");
  const entries = await readdir(storage).catch(() => [] as string[]);
  return entries.filter((name) => name.startsWith("moz-extension+++")).map((name) => join(storage, name));
}

/** Remove a profile's rebuildable caches; only call while its browser is closed. */
export async function pruneProfileCaches(profileId: string): Promise<void> {
  const dir = join(profileRoot(), profileId);
  const targets = [...PRUNABLE_DIRS.map((name) => join(dir, name)), ...(await extensionStorageDirs(dir))];
  await Promise.all(targets.map((path) => rm(path, { recursive: true, force: true })));
}

/**
 * Worker boot (no browser running): drop caches in every profile and delete profile dirs
 * no identity points at. Logs the biggest subfolders so growth stays visible.
 */
export async function sweepProfileDisk(): Promise<void> {
  const root = profileRoot();
  const dirs = await readdir(root).catch(() => [] as string[]);
  if (dirs.length === 0) return;

  const before = await sizeOf(root);
  const identities = await prisma.identity.findMany({ select: { externalProfileId: true } });
  const known = new Set(identities.map((identity) => identity.externalProfileId).filter(Boolean));

  const bySubdir = new Map<string, number>();
  let orphans = 0;
  for (const dir of dirs) {
    if (known.size > 0 && !known.has(dir)) {
      await rm(join(root, dir), { recursive: true, force: true });
      orphans += 1;
      continue;
    }
    for (const sub of await readdir(join(root, dir)).catch(() => [] as string[])) {
      bySubdir.set(sub, (bySubdir.get(sub) ?? 0) + (await sizeOf(join(root, dir, sub))));
    }
    await pruneProfileCaches(dir);
  }

  const after = await sizeOf(root);
  const top = [...bySubdir.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, bytes]) => `${name}=${mb(bytes)}MB`)
    .join(" ");
  console.error(
    `[disk] profile sweep: ${mb(before)}MB -> ${mb(after)}MB, profiles=${dirs.length - orphans} orphansRemoved=${orphans} top: ${top}`,
  );
}
