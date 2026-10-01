-- CreateTable
CREATE TABLE "session_snapshots" (
    "session_id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "position" INTEGER,
    "serp_page" INTEGER,
    "source" TEXT,
    "result_title" TEXT,
    "page_url" TEXT,
    "egress_city" TEXT,
    "identity_external_id" TEXT,
    "image_jpeg" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_snapshots_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE INDEX "session_snapshots_experiment_id_created_at_idx" ON "session_snapshots"("experiment_id", "created_at");

-- AddForeignKey
ALTER TABLE "session_snapshots" ADD CONSTRAINT "session_snapshots_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

