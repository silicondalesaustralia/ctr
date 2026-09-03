import type { Page } from "playwright";

export interface EgressGeo {
  ip: string;
  country: string;
  region?: string;
  city?: string;
  source: string;
}

export class WrongEgressGeoError extends Error {
  readonly egress: EgressGeo;
  readonly expectedCountry: string;

  constructor(egress: EgressGeo, expectedCountry: string) {
    super(
      `Proxy egress geo mismatch: expected ${expectedCountry}, got ${egress.country}` +
        `${egress.city ? ` (${egress.city})` : ""} ip=${egress.ip}`,
    );
    this.name = "WrongEgressGeoError";
    this.egress = egress;
    this.expectedCountry = expectedCountry;
  }
}

interface IpLookupPayload {
  ip?: unknown;
  query?: unknown;
  country?: unknown;
  country_code?: unknown;
  countryCode?: unknown;
  region?: unknown;
  region_name?: unknown;
  city?: unknown;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseEgressGeoPayload(
  payload: IpLookupPayload,
  source: string,
): EgressGeo {
  const ip =
    asTrimmedString(payload.ip) ?? asTrimmedString(payload.query);
  const country = (
    asTrimmedString(payload.country_code) ??
    asTrimmedString(payload.countryCode) ??
    asTrimmedString(payload.country)
  )?.toUpperCase();

  if (!ip || !country) {
    throw new Error(`Egress geo lookup returned incomplete data from ${source}`);
  }

  return {
    ip,
    country,
    region: asTrimmedString(payload.region_name) ?? asTrimmedString(payload.region),
    city: asTrimmedString(payload.city),
    source,
  };
}

export function assertExpectedCountry(
  egress: EgressGeo,
  expectedCountry: string,
): void {
  if (egress.country.toUpperCase() !== expectedCountry.toUpperCase()) {
    throw new WrongEgressGeoError(egress, expectedCountry.toUpperCase());
  }
}

const LOOKUP_URLS = [
  "https://ipinfo.io/json",
  "https://ipapi.co/json/",
  "http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,query",
] as const;

async function lookupViaFetch(page: Page, url: string): Promise<IpLookupPayload> {
  try {
    return await page.evaluate(async (lookupUrl) => {
      const response = await fetch(lookupUrl, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as IpLookupPayload;
    }, url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`geo fetch failed (${url}): ${message}`);
  }
}

async function lookupViaNavigation(page: Page, url: string): Promise<IpLookupPayload> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  const text = await page.locator("body").innerText();
  return JSON.parse(text) as IpLookupPayload;
}

/**
 * Resolve the browser's egress IP geo via in-page fetch (uses the active proxy).
 * Throws WrongEgressGeoError when country does not match expectedCountry.
 */
export async function verifyBrowserEgressGeo(
  page: Page,
  expectedCountry = "AU",
): Promise<EgressGeo> {
  let lastError: unknown;

  for (const url of LOOKUP_URLS) {
    for (const mode of ["fetch", "goto"] as const) {
      try {
        const payload =
          mode === "fetch"
            ? await lookupViaFetch(page, url)
            : await lookupViaNavigation(page, url);
        const egress = parseEgressGeoPayload(payload, `${url} (${mode})`);
        console.error(
          `[geo] egress ip=${egress.ip} country=${egress.country}` +
            `${egress.city ? ` city=${egress.city}` : ""} via ${egress.source}`,
        );
        assertExpectedCountry(egress, expectedCountry);
        return egress;
      } catch (error) {
        if (error instanceof WrongEgressGeoError) {
          throw error;
        }
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[geo] lookup failed via ${url} (${mode}): ${message}`);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Proxy egress geo lookup failed: ${message}`);
}
