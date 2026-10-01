-- CreateTable
CREATE TABLE "bad_geo_ip_prefixes" (
    "prefix" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "fail_count" INTEGER NOT NULL DEFAULT 1,
    "last_geo" TEXT,
    "last_failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bad_geo_ip_prefixes_pkey" PRIMARY KEY ("prefix","scope")
);

