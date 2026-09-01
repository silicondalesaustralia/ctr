-- GMB / local-pack session event types
ALTER TYPE "SessionEventType" ADD VALUE IF NOT EXISTS 'local_pack_found';
ALTER TYPE "SessionEventType" ADD VALUE IF NOT EXISTS 'gmb_opened';
ALTER TYPE "SessionEventType" ADD VALUE IF NOT EXISTS 'gmb_action_website';
ALTER TYPE "SessionEventType" ADD VALUE IF NOT EXISTS 'gmb_action_directions';
ALTER TYPE "SessionEventType" ADD VALUE IF NOT EXISTS 'gmb_action_call';
ALTER TYPE "SessionEventType" ADD VALUE IF NOT EXISTS 'target_not_found';
