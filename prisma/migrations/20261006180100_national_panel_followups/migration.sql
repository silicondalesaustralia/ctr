-- AlterEnum
ALTER TYPE "RankSnapshotKind" ADD VALUE 'followup';

-- DropIndex
DROP INDEX "rank_snapshots_experiment_id_query_local_date_kind_key";

-- AlterTable
ALTER TABLE "rank_snapshots" ADD COLUMN     "panel_city" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "rank_snapshots_experiment_id_query_local_date_kind_panel_ci_key" ON "rank_snapshots"("experiment_id", "query", "local_date", "kind", "panel_city");
