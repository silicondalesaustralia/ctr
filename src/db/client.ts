import { PrismaClient } from "@prisma/client";

/**
 * Neon + a long-lived worker cannot open dozens of Prisma connections.
 * Railway/Neon URLs sometimes ship connection_limit=97 which exhausts the
 * pooler and leaves sessions stuck as browser_error / poll_failed.
 */
export function withSafePrismaPool(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    const rawLimit = url.searchParams.get("connection_limit");
    const parsed = rawLimit ? Number(rawLimit) : NaN;
    if (!Number.isFinite(parsed) || parsed > 10 || parsed < 1) {
      url.searchParams.set("connection_limit", "5");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20");
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function createPrismaClient(): PrismaClient {
  const raw = process.env.DATABASE_URL;
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(raw
      ? { datasources: { db: { url: withSafePrismaPool(raw) } } }
      : {}),
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
