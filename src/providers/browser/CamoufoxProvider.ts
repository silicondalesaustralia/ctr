import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Camoufox } from "camoufox-js";
import { ProfileProvider } from "@prisma/client";
import { getEnv, isGoLoginHeadless } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";
import type {
  BrowserProfile,
  BrowserProfileProvider,
  CreateProfileInput,
  RunningBrowser,
  StartProfileOptions,
} from "./BrowserProfileProvider.js";
import {
  camoufoxOsFor,
  createPinnedFingerprint,
  loadPinnedFingerprint,
} from "./camoufox-fingerprint.js";
import { buildCamoufoxGeo } from "./camoufox-geo.js";
import { DISK_CACHE_PREFS, pruneProfileCaches } from "./profile-disk.js";
import { applyGoogleGeoHeader, cityGeoPoint } from "../../browser/google-geo-header.js";

const GOOGLE_ORIGINS = ["https://www.google.com.au", "https://www.google.com"];

function profileDir(profileId: string): string {
  return resolve(join(getEnv().CAMOUFOX_PROFILE_DIR, profileId));
}

/**
 * Camoufox (Firefox) with a pinned per-identity device fingerprint and a
 * persistent user-data dir, so each identity is a returning visitor.
 */
export class CamoufoxProvider implements BrowserProfileProvider {
  async createProfile(input: CreateProfileInput): Promise<BrowserProfile> {
    if (input.deviceClass !== "desktop") {
      throw new Error("Camoufox supports desktop identities only");
    }
    const profileId = randomUUID();
    await createPinnedFingerprint(profileId, camoufoxOsFor(input.osFamily));
    await mkdir(profileDir(profileId), { recursive: true });
    return {
      profileId,
      provider: ProfileProvider.camoufox,
      name: input.name,
      deviceClass: input.deviceClass,
      osFamily: input.osFamily,
      locale: input.locale,
      timezone: input.timezone,
      region: input.region,
      city: input.city,
    };
  }

  async startProfile(
    profileId: string,
    proxy?: ProxyConfig,
    options: StartProfileOptions = {},
  ): Promise<RunningBrowser> {
    const pinned = await loadPinnedFingerprint(profileId);
    const geo = await buildCamoufoxGeo(proxy, options.geoPoint);
    const dir = profileDir(profileId);
    await mkdir(dir, { recursive: true });
    const googleGeo = getEnv().GOOGLE_XGEO_ENABLED
      ? (options.googleGeoPoint ?? options.geoPoint ?? cityGeoPoint(proxy?.city, profileId))
      : undefined;

    console.error(
      `[camoufox] Starting ${profileId} os=${pinned.os} egress=${geo.egressIp}` +
        ` tz=${String(geo.config.timezone ?? "?")}${options.geoPoint ? " gps=campaign" : ""}` +
        (googleGeo ? ` xgeo=${googleGeo.latitude.toFixed(3)},${googleGeo.longitude.toFixed(3)}` : " xgeo=off"),
    );

    const context = await Camoufox({
      user_data_dir: dir,
      headless: isGoLoginHeadless(),
      os: pinned.os,
      fingerprint: pinned.fingerprint,
      webgl_config: pinned.webgl,
      config: { ...pinned.seeds, ...geo.config },
      firefox_user_prefs: { ...DISK_CACHE_PREFS, ...geo.firefoxPrefs },
      locale: "en-AU",
      humanize: true,
      i_know_what_im_doing: true,
      ...(proxy && {
        proxy: {
          server: `http://${proxy.host}:${proxy.port}`,
          username: proxy.username,
          password: proxy.password,
        },
      }),
    });

    if (options.geoPoint) {
      // Camoufox's geolocation config alone never answers getCurrentPosition; the
      // Playwright override does, and needs the permission granted per origin.
      await context.setGeolocation({ ...options.geoPoint, accuracy: 30 });
      for (const origin of GOOGLE_ORIGINS) {
        await context.grantPermissions(["geolocation"], { origin });
      }
    }
    if (googleGeo) await applyGoogleGeoHeader(context, googleGeo);

    return { profileId, context, runtime: "camoufox" };
  }

  async stopProfile(profileId: string, running?: RunningBrowser): Promise<void> {
    if (!running?.context) return;
    await running.context.close().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[camoufox] Close failed for ${profileId}: ${message}`);
    });
    await pruneProfileCaches(profileId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[camoufox] Cache prune failed for ${profileId}: ${message}`);
    });
  }

  async updateProxy(): Promise<void> {
    // Proxy is supplied per launch; nothing is stored on the profile.
  }

  async getProfile(profileId: string): Promise<BrowserProfile | null> {
    const row = await prisma.browserFingerprint.findUnique({ where: { profileId } });
    if (!row) return null;
    const identity = await prisma.identity.findFirst({ where: { externalProfileId: profileId } });
    return {
      profileId,
      provider: ProfileProvider.camoufox,
      name: identity?.externalId ?? profileId,
      deviceClass: "desktop",
      osFamily: row.os,
      locale: identity?.locale ?? "en-AU",
      timezone: identity?.timezone ?? "Australia/Adelaide",
      region: identity?.region ?? "",
      city: identity?.city ?? "",
    };
  }

  /** Remove the pinned fingerprint and on-disk profile (identity retirement). */
  async deleteProfile(profileId: string): Promise<void> {
    await prisma.browserFingerprint.deleteMany({ where: { profileId } });
    await rm(profileDir(profileId), { recursive: true, force: true });
  }
}
