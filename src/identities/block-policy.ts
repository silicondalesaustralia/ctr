import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { recordBlockedEgress } from "../providers/proxy/ip-reputation.js";

/** Park an identity only after this many Google blocks in a row (each on a fresh IP). */
export const MAX_CONSECUTIVE_BLOCKS = 2;
/** Delay before the one retry on a fresh IP. */
export const BLOCK_RETRY_DELAY_MINUTES = 30;

export interface BlockOutcome {
  parked: boolean;
  consecutiveBlocks: number;
}

/** Flags the egress prefix, bumps the streak, parks at MAX_CONSECUTIVE_BLOCKS. */
export async function registerGoogleBlock(
  identityId: string,
  egressIp: string | undefined,
): Promise<BlockOutcome> {
  await recordBlockedEgress(egressIp);

  const updated = await prisma.identity.update({
    where: { id: identityId },
    data: { consecutiveBlocks: { increment: 1 } },
    select: { consecutiveBlocks: true, externalId: true },
  });

  const parked = updated.consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS;
  if (parked) {
    await prisma.identity.update({ where: { id: identityId }, data: { active: false } });
  }

  logger.warn({
    event: parked ? "identity_parked_blocks" : "identity_block_retry",
    identityId: updated.externalId,
    consecutiveBlocks: updated.consecutiveBlocks,
  });
  return { parked, consecutiveBlocks: updated.consecutiveBlocks };
}

/** A Google session that loaded without a block resets the streak. */
export async function registerGoogleClean(identityId: string): Promise<void> {
  await prisma.identity.updateMany({
    where: { id: identityId, consecutiveBlocks: { gt: 0 } },
    data: { consecutiveBlocks: 0 },
  });
}
