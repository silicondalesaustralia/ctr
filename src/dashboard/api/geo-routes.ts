import type { Express, Request } from "express";
import { getGeoCapacity, listCityOptions } from "../../campaign/geo-capacity.js";
import { listRegionOptions } from "../../experiments/query-generator.js";
import { countryName, DEFAULT_COUNTRY, listCountries } from "../../geo/locations.js";
import type { CustomLocationInput } from "../../geo/types.js";
import { createAdditionalIdentities } from "../../identities/identity-service.js";

function queryCountry(req: Request): string {
  const raw = typeof req.query.country === "string" ? req.query.country.trim().toUpperCase() : "";
  return raw || DEFAULT_COUNTRY;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseCustomLocation(value: unknown): CustomLocationInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  return {
    country: optionalString(raw.country) ?? "",
    city: optionalString(raw.city) ?? "",
    region: optionalString(raw.region),
    timezone: optionalString(raw.timezone) ?? "",
    locale: optionalString(raw.locale),
  };
}

export function registerGeoRoutes(app: Express): void {
  app.get("/countries", (_req, res) => {
    res.json(
      listCountries().map((country) => ({
        code: country.code,
        name: country.name,
        locale: country.locale,
        cities: country.cities.map((row) => ({ city: row.city, region: row.region, timezone: row.timezone })),
      })),
    );
  });

  app.get("/regions", (req, res) => {
    const country = queryCountry(req);
    res.json([
      { code: "ALL", label: `All ${countryName(country)}`, city: "Mixed" },
      ...listRegionOptions(country),
    ]);
  });

  app.get("/cities", (req, res) => {
    res.json(listCityOptions(queryCountry(req)));
  });

  app.get("/campaign/geo-capacity", async (req, res) => {
    const city = String(req.query.city ?? "").trim();
    const suggested = Number(req.query.suggested ?? 0);
    if (!city) {
      res.status(400).json({ error: "city is required" });
      return;
    }
    try {
      const capacity = await getGeoCapacity(
        city,
        Number.isFinite(suggested) ? suggested : 0,
        true,
        queryCountry(req),
      );
      res.json(capacity);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.post("/identities/create", async (req, res) => {
    const body = req.body as {
      count?: number;
      desktopPercent?: number;
      country?: unknown;
      city?: unknown;
      custom?: unknown;
    };
    try {
      const result = await createAdditionalIdentities({
        count: body.count ?? 1,
        desktopPercent: body.desktopPercent,
        country: optionalString(body.country),
        city: optionalString(body.city),
        custom: parseCustomLocation(body.custom),
      });
      res.json({
        createdCount: result.created.length,
        fromExternalId: result.fromExternalId,
        toExternalId: result.toExternalId,
        identities: result.created.map((identity) => ({
          id: identity.id,
          externalId: identity.externalId,
          country: identity.country,
          region: identity.region,
          city: identity.city,
          deviceClass: identity.deviceClass,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });
}
