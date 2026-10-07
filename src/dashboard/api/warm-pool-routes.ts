import type { Express } from "express";
import { getEnv } from "../../config/env.js";
import { mobileIdentitiesAvailable } from "../../identities/provider-compat.js";
import { getWarmPoolStatus, setWarmPoolTargets } from "../../warmup/warm-pool-settings.js";
import { runWarmPoolTick } from "../../warmup/warm-pool.js";

export function registerWarmPoolRoutes(app: Express): void {
  app.get("/settings/warm-pool", async (_req, res) => {
    try {
      res.json({
        provider: getEnv().BROWSER_PROFILE_PROVIDER,
        mobileAvailable: mobileIdentitiesAvailable(),
        cities: await getWarmPoolStatus(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  app.put("/settings/warm-pool", async (req, res) => {
    const body = req.body as { targets?: unknown };
    if (!body.targets || typeof body.targets !== "object" || Array.isArray(body.targets)) {
      res.status(400).json({ error: "targets must be an object of city → { desktop, mobile }" });
      return;
    }
    try {
      await setWarmPoolTargets(body.targets as Record<string, unknown>);
      // Fire-and-forget top-up so new targets start filling without waiting an hour.
      void runWarmPoolTick();
      res.json({
        provider: getEnv().BROWSER_PROFILE_PROVIDER,
        mobileAvailable: mobileIdentitiesAvailable(),
        cities: await getWarmPoolStatus(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });
}
