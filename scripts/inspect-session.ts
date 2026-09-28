import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const id = process.argv.find((a) => a.startsWith("--id="))?.slice(5);
  if (!id) throw new Error("Usage: tsx scripts/inspect-session.ts --id=<sessionId>");
  const session = await prisma.session.findUnique({
    where: { id },
    include: { events: { orderBy: { timestamp: "asc" } } },
  });
  if (!session) throw new Error(`Session ${id} not found`);
  const { events, ...rest } = session;
  console.log(JSON.stringify(rest, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log("\n=== EVENTS ===");
  for (const e of events) {
    console.log(`${e.timestamp.toISOString()} ${e.eventType} ${e.metadataJson ?? ""}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
