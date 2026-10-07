import { prisma } from "../../db/client.js";
import { logger } from "../../config/logger.js";

/** How long a /24 (or IPv6 /48) stays screened after Google blocked an exit in it. */
export const BLOCKED_PREFIX_TTL_DAYS = 14;

export class FlaggedIpPrefixError extends Error {
  readonly prefix: string;

  constructor(prefix: string, ip: string) {
    super(`Proxy egress IP prefix flagged: prefix=${prefix} ip=${ip}`);
    this.name = "FlaggedIpPrefixError";
    this.prefix = prefix;
  }
}

/** IPv4 → "a.b.c" (/24); IPv6 → first three hextets (/48). */
export function ipPrefix(ip: string): string | null {
  const trimmed = ip.trim();
  const v4 = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}`;
  if (trimmed.includes(":")) {
    const groups = trimmed.toLowerCase().split(":").filter((group) => group.length > 0);
    if (groups.length >= 3) return groups.slice(0, 3).join(":");
  }
  return null;
}

/**
 * Reputation key: the /24 (/48) for fixed lines, the exact IP for mobile —
 * a carrier /24 is CGNAT shared by many real phones, so one block says little about it.
 */
export function reputationKey(ip: string, mobile = false): string | null {
  const trimmed = ip.trim();
  if (!mobile) return ipPrefix(trimmed);
  return ipPrefix(trimmed) ? trimmed.toLowerCase() : null;
}

export async function recordBlockedEgress(ip: string | undefined, mobile = false): Promise<void> {
  const prefix = ip ? reputationKey(ip, mobile) : null;
  if (!prefix) return;
  try {
    await prisma.blockedIpPrefix.upsert({
      where: { prefix },
      create: { prefix, blockCount: 1, lastBlockedAt: new Date() },
      update: { blockCount: { increment: 1 }, lastBlockedAt: new Date() },
    });
    logger.warn({ event: "ip_prefix_flagged", prefix });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ event: "ip_prefix_record_failed", prefix, error: message });
  }
}

/** Throws FlaggedIpPrefixError (→ proxy_error retry on a fresh lease) before Google. */
export async function assertEgressPrefixClean(ip: string, mobile = false): Promise<void> {
  const prefix = reputationKey(ip, mobile);
  if (!prefix) return;
  const since = new Date(Date.now() - BLOCKED_PREFIX_TTL_DAYS * 24 * 60 * 60 * 1000);
  const flagged = await prisma.blockedIpPrefix.findFirst({
    where: { prefix, lastBlockedAt: { gte: since } },
  });
  if (flagged) {
    console.error(`[geo] egress ${ip} in flagged prefix ${prefix} — drawing a new lease`);
    throw new FlaggedIpPrefixError(prefix, ip);
  }
}
