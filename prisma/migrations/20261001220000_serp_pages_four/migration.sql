-- Sessions, snapshots and preflight search to the end of results page 4.
ALTER TABLE "experiments" ALTER COLUMN "max_serp_pages" SET DEFAULT 4;
UPDATE "experiments" SET "max_serp_pages" = 4 WHERE "campaign_kind" = 'url' AND "max_serp_pages" < 4;
