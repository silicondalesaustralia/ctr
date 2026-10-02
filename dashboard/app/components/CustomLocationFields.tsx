"use client";

import type { CSSProperties } from "react";
import type { CustomLocation } from "../../lib/geo";

interface CustomLocationFieldsProps {
  value: CustomLocation;
  onChange: (value: CustomLocation) => void;
  fieldStyle: CSSProperties;
}

export function isCustomLocationComplete(value: CustomLocation): boolean {
  return /^[A-Za-z]{2}$/.test(value.country.trim()) && Boolean(value.city.trim()) && Boolean(value.timezone.trim());
}

export default function CustomLocationFields({ value, onChange, fieldStyle }: CustomLocationFieldsProps) {
  const update = (patch: Partial<CustomLocation>) => onChange({ ...value, ...patch });
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
      <input
        value={value.country}
        onChange={(event) => update({ country: event.target.value.toUpperCase().slice(0, 2) })}
        placeholder="CC"
        aria-label="Country code"
        style={{ ...fieldStyle, width: 56 }}
      />
      <input
        value={value.city}
        onChange={(event) => update({ city: event.target.value })}
        placeholder="City"
        aria-label="City"
        style={{ ...fieldStyle, width: 140 }}
      />
      <input
        value={value.region ?? ""}
        onChange={(event) => update({ region: event.target.value })}
        placeholder="Region (optional)"
        aria-label="Region"
        style={{ ...fieldStyle, width: 130 }}
      />
      <input
        value={value.timezone}
        onChange={(event) => update({ timezone: event.target.value })}
        placeholder="Timezone, e.g. America/Denver"
        aria-label="Timezone"
        style={{ ...fieldStyle, width: 220 }}
      />
      <input
        value={value.locale ?? ""}
        onChange={(event) => update({ locale: event.target.value })}
        placeholder="Locale, e.g. en-US (optional)"
        aria-label="Locale"
        style={{ ...fieldStyle, width: 200 }}
      />
    </div>
  );
}
