ALTER TYPE "ProfileProvider" ADD VALUE 'camoufox';

ALTER TABLE "experiments" ADD COLUMN "geo_latitude" DOUBLE PRECISION;
ALTER TABLE "experiments" ADD COLUMN "geo_longitude" DOUBLE PRECISION;
ALTER TABLE "experiments" ADD COLUMN "geo_radius_km" DOUBLE PRECISION;

ALTER TABLE "identities" ADD COLUMN "consecutive_blocks" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "browser_fingerprints" (
    "profile_id" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "fingerprint_json" TEXT NOT NULL,
    "webgl_vendor" TEXT NOT NULL,
    "webgl_renderer" TEXT NOT NULL,
    "seeds_json" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "browser_fingerprints_pkey" PRIMARY KEY ("profile_id")
);

CREATE TABLE "blocked_ip_prefixes" (
    "prefix" TEXT NOT NULL,
    "block_count" INTEGER NOT NULL DEFAULT 1,
    "last_blocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "blocked_ip_prefixes_pkey" PRIMARY KEY ("prefix")
);
