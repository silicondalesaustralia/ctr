export interface CityConfig {
  /** Region/state code, unique within its country. */
  region: string;
  city: string;
  timezone: string;
  /** Relative share of identities when a country is filled without a forced city. */
  weight: number;
  latitude: number;
  longitude: number;
}

export interface CountryConfig {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  name: string;
  locale: string;
  /** Everyday non-Google sites used to age cookies before Google. */
  warmSites: readonly string[];
  cities: readonly CityConfig[];
}

/** Coherent country/city/timezone/locale for one identity. */
export interface IdentityLocation {
  country: string;
  locale: string;
  region: string;
  city: string;
  timezone: string;
}

/** A location outside the built-in catalog, entered by the operator. */
export interface CustomLocationInput {
  country: string;
  city: string;
  region?: string;
  timezone: string;
  locale?: string;
}
