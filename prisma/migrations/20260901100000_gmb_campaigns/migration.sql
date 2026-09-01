-- GMB campaign kind + local geo / business profile fields
CREATE TYPE "CampaignKind" AS ENUM ('url', 'gmb');

ALTER TABLE "experiments" ADD COLUMN "campaign_kind" "CampaignKind" NOT NULL DEFAULT 'url';
ALTER TABLE "experiments" ADD COLUMN "focus_city" TEXT;
ALTER TABLE "experiments" ADD COLUMN "gmb_business_name" TEXT;
ALTER TABLE "experiments" ADD COLUMN "gmb_place_id" TEXT;
ALTER TABLE "experiments" ADD COLUMN "gmb_maps_url" TEXT;
ALTER TABLE "experiments" ADD COLUMN "gmb_actions_json" TEXT;
