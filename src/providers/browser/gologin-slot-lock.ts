import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { createRedisConnection } from "../../config/redis.js";
import { sleep } from "../../utils/helpers.js";

const LOCK_KEY = "gologin:cloud-slot";
/** Auto-expire if a worker crashes mid-session. */
const LOCK_TTL_SECONDS = 25 * 60;
const WAIT_POLL_MS = 5_000;
/** How long a new session will wait for the single cloud slot. */
const WAIT_TIMEOUT_MS = 8 * 60 * 1000;

const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = createRedisConnection();
  }
  return redis;
}

export class GoLoginSlotBusyError extends Error {
  constructor(message = "GoLogin cloud slot busy — another browser is using the plan's single parallel launch") {
    super(message);
    this.name = "GoLoginSlotBusyError";
  }
}

export async function acquireGoLoginSlot(label: string): Promise<string> {
  const client = getRedis();
  const token = randomUUID();
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const ok = await client.set(LOCK_KEY, token, "EX", LOCK_TTL_SECONDS, "NX");
    if (ok === "OK") {
      console.error(`[gologin] Acquired cloud slot for ${label}`);
      return token;
    }
    const holder = await client.get(LOCK_KEY);
    console.error(
      `[gologin] Cloud slot held (${holder?.slice(0, 8) ?? "unknown"}…); waiting for ${label}…`,
    );
    await sleep(WAIT_POLL_MS);
  }

  throw new GoLoginSlotBusyError();
}

export async function releaseGoLoginSlot(token: string | undefined): Promise<void> {
  if (!token) return;
  const client = getRedis();
  const result = await client.eval(RELEASE_LUA, 1, LOCK_KEY, token);
  if (result === 1) {
    console.error("[gologin] Released cloud slot");
  }
}

/** Used by manual stop scripts / crash recovery — clears the slot unconditionally. */
export async function forceReleaseGoLoginSlot(): Promise<void> {
  const client = getRedis();
  await client.del(LOCK_KEY);
  console.error("[gologin] Force-released cloud slot");
}
