import type { Page } from "./pw.js";

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
  readonly expectedCity?: string;

  constructor(egress: EgressGeo, expectedCountry: string, expectedCity?: string) {
    const expected =
      expectedCity?.trim()
        ? `${expectedCountry}/${expectedCity.trim()}`
        : expectedCountry;
    const got = egress.city
      ? `${egress.country}/${egress.city}`
      : egress.country;
    super(
      `Proxy egress geo mismatch: expected ${expected}, got ${got} ip=${egress.ip}`,
    );
    this.name = "WrongEgressGeoError";
    this.egress = egress;
    this.expectedCountry = expectedCountry;
    this.expectedCity = expectedCity?.trim() || undefined;
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
  status?: unknown;
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
  if (payload.status === "fail") {
    throw new Error(`Egress geo lookup rejected by ${source}`);
  }

  const ip = asTrimmedString(payload.ip) ?? asTrimmedString(payload.query);
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

export function normalizeCityName(city: string): string {
  return city.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

export function assertExpectedCountry(
  egress: EgressGeo,
  expectedCountry: string,
): void {
  if (egress.country.toUpperCase() !== expectedCountry.toUpperCase()) {
    throw new WrongEgressGeoError(egress, expectedCountry.toUpperCase());
  }
}

/** Soft Premium Ports city targeting can land another AU city — reject before Google. */
export function assertExpectedCity(
  egress: EgressGeo,
  expectedCountry: string,
  expectedCity: string,
): void {
  assertExpectedCountry(egress, expectedCountry);
  const want = normalizeCityName(expectedCity);
  const got = egress.city ? normalizeCityName(egress.city) : "";
  if (!got || got !== want) {
    throw new WrongEgressGeoError(
      egress,
      expectedCountry.toUpperCase(),
      expectedCity,
    );
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
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  const text = await page.locator("body").innerText();
  return JSON.parse(text) as IpLookupPayload;
}

function assertEgressGeo(
  egress: EgressGeo,
  expectedCountry: string,
  expectedCity?: string,
): void {
  if (expectedCity?.trim()) {
    assertExpectedCity(egress, expectedCountry, expectedCity);
    return;
  }
  assertExpectedCountry(egress, expectedCountry);
}

/**
 * Resolve egress IP geo via the browser proxy.
 * Uses a dedicated tab so lookups never race the session page's navigations.
 * When expectedCity is set, Soft PP city misses become proxy_error retries
 * instead of Google from the wrong metro.
 */
export async function verifyBrowserEgressGeo(
  page: Page,
  expectedCountry = "AU",
  expectedCity?: string,
): Promise<EgressGeo> {
  const geoPage = await page.context().newPage();
  let lastError: unknown;

  try {
    // Prefer in-page fetch — no main-frame navigation races.
    for (const url of LOOKUP_URLS) {
      try {
        const payload = await lookupViaFetch(geoPage, url);
        const egress = parseEgressGeoPayload(payload, `${url} (fetch)`);
        console.error(
          `[geo] egress ip=${egress.ip} country=${egress.country}` +
            `${egress.city ? ` city=${egress.city}` : ""} via ${egress.source}`,
        );
        assertEgressGeo(egress, expectedCountry, expectedCity);
        return egress;
      } catch (error) {
        if (error instanceof WrongEgressGeoError) throw error;
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[geo] lookup failed via ${url} (fetch): ${message}`);
      }
    }

    // Sequential goto fallbacks only — never overlap navigations.
    for (const url of LOOKUP_URLS) {
      try {
        const payload = await lookupViaNavigation(geoPage, url);
        const egress = parseEgressGeoPayload(payload, `${url} (goto)`);
        console.error(
          `[geo] egress ip=${egress.ip} country=${egress.country}` +
            `${egress.city ? ` city=${egress.city}` : ""} via ${egress.source}`,
        );
        assertEgressGeo(egress, expectedCountry, expectedCity);
        return egress;
      } catch (error) {
        if (error instanceof WrongEgressGeoError) throw error;
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[geo] lookup failed via ${url} (goto): ${message}`);
      }
    }
  } finally {
    await geoPage.close().catch(() => undefined);
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Proxy egress geo lookup failed: ${message}`);
}
