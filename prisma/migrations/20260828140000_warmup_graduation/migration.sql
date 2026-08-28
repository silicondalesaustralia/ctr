-- Warmup graduation gate: benign site clicks + commercial SERP test
CREATE TYPE "WarmupSessionKind" AS ENUM ('benign', 'graduation');

ALTER TABLE "identities" ADD COLUMN "warmup_graduation_passed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "warmup_sessions" ADD COLUMN "kind" "WarmupSessionKind" NOT NULL DEFAULT 'benign';
