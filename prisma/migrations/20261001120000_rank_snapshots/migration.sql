-- CreateEnum
CREATE TYPE "RankSnapshotKind" AS ENUM ('baseline', 'daily', 'manual');

-- CreateEnum
CREATE TYPE "RankSnapshotStatus" AS ENUM ('pending', 'running', 'captured', 'not_found', 'blocked', 'error');

-- CreateTable
CREATE TABLE "rank_snapshots" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "kind" "RankSnapshotKind" NOT NULL,
    "local_date" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RankSnapshotStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER,
    "serp_page" INTEGER,
    "source" TEXT,
    "result_title" TEXT,
    "page_url" TEXT,
    "egress_city" TEXT,
    "identity_external_id" TEXT,
    "image_jpeg" BYTEA,
    "error_message" TEXT,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rank_snapshots_status_scheduled_at_idx" ON "rank_snapshots"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "rank_snapshots_experiment_id_query_local_date_kind_key" ON "rank_snapshots"("experiment_id", "query", "local_date", "kind");

-- AddForeignKey
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

