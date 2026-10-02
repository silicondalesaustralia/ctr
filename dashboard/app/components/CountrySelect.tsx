"use client";

import type { CSSProperties } from "react";
import { CUSTOM_COUNTRY, type CountryOption } from "../../lib/geo";

interface CountrySelectProps {
  countries: CountryOption[];
  value: string;
  onChange: (code: string) => void;
  allowCustom?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}

export default function CountrySelect({
  countries,
  value,
  onChange,
  allowCustom = false,
  disabled = false,
  style,
}: CountrySelectProps) {
  const known = countries.some((row) => row.code === value) || value === CUSTOM_COUNTRY;
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Country"
      disabled={disabled}
      style={style}
    >
      {!known && <option value={value}>{value}</option>}
      {countries.map((row) => (
        <option key={row.code} value={row.code}>
          {row.name} ({row.code})
        </option>
      ))}
      {allowCustom && <option value={CUSTOM_COUNTRY}>Custom location…</option>}
    </select>
  );
}
