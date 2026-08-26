-- Campaign intensity model: traffic inputs and per-query allocation

CREATE TYPE "TreatmentIntensity" AS ENUM ('low', 'normal', 'strong');
CREATE TYPE "CtrSource" AS ENUM ('default_curve', 'gsc_site_curve');

ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'AU';
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "campaign_duration_days" INTEGER NOT NULL DEFAULT 14;
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "treatment_intensity" "TreatmentIntensity" NOT NULL DEFAULT 'normal';
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "adaptive_pacing" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "recalculate_every_days" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "max_share_of_search_demand" DOUBLE PRECISION NOT NULL DEFAULT 0.02;
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "max_share_of_gsc_impressions" DOUBLE PRECISION NOT NULL DEFAULT 0.05;
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "desktop_percent" INTEGER NOT NULL DEFAULT 65;
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "ctr_source" "CtrSource" NOT NULL DEFAULT 'default_curve';
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "last_pacing_recalc_at" TIMESTAMP(3);

ALTER TABLE "experiment_queries" ADD COLUMN IF NOT EXISTS "monthly_search_volume" INTEGER;
ALTER TABLE "experiment_queries" ADD COLUMN IF NOT EXISTS "starting_position" DOUBLE PRECISION;
ALTER TABLE "experiment_queries" ADD COLUMN IF NOT EXISTS "gsc_impressions_28d" INTEGER;
ALTER TABLE "experiment_queries" ADD COLUMN IF NOT EXISTS "gsc_clicks_28d" INTEGER;
ALTER TABLE "experiment_queries" ADD COLUMN IF NOT EXISTS "allocated_sessions" INTEGER;
