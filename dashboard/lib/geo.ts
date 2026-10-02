"use client";

import { useEffect, useState } from "react";
import { apiGet } from "./api";

export const DEFAULT_COUNTRY = "AU";
export const CUSTOM_COUNTRY = "__custom__";

export interface CountryCity {
  city: string;
  region: string;
  timezone: string;
}

export interface CountryOption {
  code: string;
  name: string;
  locale: string;
  cities: CountryCity[];
}

export interface CustomLocation {
  country: string;
  city: string;
  region?: string;
  timezone: string;
  locale?: string;
}

export interface CreateIdentitiesRequest {
  count: number;
  country?: string;
  city?: string;
  custom?: CustomLocation;
}

export function withCountry(path: string, country: string | undefined): string {
  if (!country) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}country=${encodeURIComponent(country)}`;
}

export function describeLocation(request: CreateIdentitiesRequest, countries: CountryOption[]): string {
  if (request.custom) {
    return `${request.custom.city}, ${request.custom.country.toUpperCase()}`;
  }
  const name = countries.find((row) => row.code === request.country)?.name ?? request.country ?? "";
  return request.city ? `${request.city}, ${name}` : `mixed-location ${name}`.trim();
}

export function useCountries(): { countries: CountryOption[]; error: string | null } {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<CountryOption[]>("/countries")
      .then((rows) => {
        if (!cancelled) setCountries(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load countries");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { countries, error };
}
