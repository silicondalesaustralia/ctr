CREATE TABLE IF NOT EXISTS "gsc_connections" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "google_email" TEXT,
  "refresh_token" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gsc_connections_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "gsc_connection_id" TEXT;
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "gsc_site_url" TEXT;

DO $$ BEGIN
  ALTER TABLE "experiments"
    ADD CONSTRAINT "experiments_gsc_connection_id_fkey"
    FOREIGN KEY ("gsc_connection_id") REFERENCES "gsc_connections"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
