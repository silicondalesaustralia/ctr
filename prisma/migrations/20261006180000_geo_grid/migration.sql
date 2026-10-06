-- CreateEnum
CREATE TYPE "GeoGridScanKind" AS ENUM ('baseline', 'weekly', 'manual', 'followup');

-- CreateEnum
CREATE TYPE "GeoGridScanStatus" AS ENUM ('pending', 'running', 'complete', 'partial', 'error');

-- AlterTable
ALTER TABLE "experiments" ADD COLUMN     "grid_size" INTEGER,
ADD COLUMN     "grid_spacing_km" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "geo_grid_scans" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "kind" "GeoGridScanKind" NOT NULL,
    "local_date" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "GeoGridScanStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "centre_latitude" DOUBLE PRECISION NOT NULL,
    "centre_longitude" DOUBLE PRECISION NOT NULL,
    "grid_size" INTEGER NOT NULL,
    "spacing_km" DOUBLE PRECISION NOT NULL,
    "identity_external_id" TEXT,
    "in_pack_count" INTEGER,
    "found_count" INTEGER,
    "avg_rank" DOUBLE PRECISION,
    "centre_image_jpeg" BYTEA,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geo_grid_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_grid_points" (
    "id" TEXT NOT NULL,
    "scan_id" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" "RankSnapshotStatus" NOT NULL DEFAULT 'pending',
    "position" INTEGER,
    "source" TEXT,
    "result_title" TEXT,
    "top_results_json" TEXT,
    "error_message" TEXT,
    "captured_at" TIMESTAMP(3),

    CONSTRAINT "geo_grid_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "geo_grid_scans_status_scheduled_at_idx" ON "geo_grid_scans"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "geo_grid_scans_experiment_id_query_local_date_kind_key" ON "geo_grid_scans"("experiment_id", "query", "local_date", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "geo_grid_points_scan_id_row_col_key" ON "geo_grid_points"("scan_id", "row", "col");

-- AddForeignKey
ALTER TABLE "geo_grid_scans" ADD CONSTRAINT "geo_grid_scans_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_grid_points" ADD CONSTRAINT "geo_grid_points_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "geo_grid_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
