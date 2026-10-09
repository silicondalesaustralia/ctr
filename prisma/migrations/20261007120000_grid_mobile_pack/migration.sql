-- AlterTable
ALTER TABLE "geo_grid_scans" ADD COLUMN     "mobile_in_pack_count" INTEGER,
ADD COLUMN     "mobile_attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mobile_identity_external_id" TEXT;

-- AlterTable
ALTER TABLE "geo_grid_points" ADD COLUMN     "mobile_pack_position" INTEGER,
ADD COLUMN     "mobile_top_results_json" TEXT,
ADD COLUMN     "mobile_checked_at" TIMESTAMP(3);
