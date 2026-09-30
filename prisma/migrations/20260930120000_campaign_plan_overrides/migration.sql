ALTER TABLE "experiments" ADD COLUMN "planned_session_cap" INTEGER;
ALTER TABLE "experiments" ADD COLUMN "target_identity_count" INTEGER;
ALTER TABLE "experiments" ADD COLUMN "organic_max_sessions_per_identity" INTEGER NOT NULL DEFAULT 2;
