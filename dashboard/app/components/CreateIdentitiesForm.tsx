"use client";

import { useState } from "react";
import { primaryButtonStyle } from "./campaign/shared";
import CountrySelect from "./CountrySelect";
import CustomLocationFields, { isCustomLocationComplete } from "./CustomLocationFields";
import {
  CUSTOM_COUNTRY,
  DEFAULT_COUNTRY,
  type CountryOption,
  type CreateIdentitiesRequest,
  type CustomLocation,
} from "../../lib/geo";

const MAX_BATCH = 50;

const fieldStyle = {
  padding: "8px 10px",
  border: "1px solid #dfe2ea",
  borderRadius: 6,
  fontSize: 14,
};

interface CreateIdentitiesFormProps {
  busy: boolean;
  countries: CountryOption[];
  onCreate: (request: CreateIdentitiesRequest) => void;
}

export default function CreateIdentitiesForm({ busy, countries, onCreate }: CreateIdentitiesFormProps) {
  const [count, setCount] = useState(5);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const desktopPercent = device === "desktop" ? 100 : 0;
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [city, setCity] = useState("");
  const [custom, setCustom] = useState<CustomLocation>({ country: "", city: "", timezone: "" });
  const isCustom = country === CUSTOM_COUNTRY;
  const cities = countries.find((row) => row.code === country)?.cities ?? [];
  const validCount = Number.isInteger(count) && count >= 1 && count <= MAX_BATCH;
  const valid = validCount && (!isCustom || isCustomLocationComplete(custom));

  function submit() {
    if (isCustom) {
      onCreate({
        count,
        desktopPercent,
        custom: {
          country: custom.country.trim(),
          city: custom.city.trim(),
          timezone: custom.timezone.trim(),
          region: custom.region?.trim() || undefined,
          locale: custom.locale?.trim() || undefined,
        },
      });
      return;
    }
    onCreate({ count, desktopPercent, country, city: city || undefined });
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", maxWidth: 640 }}>
      <input
        type="number"
        min={1}
        max={MAX_BATCH}
        value={Number.isNaN(count) ? "" : count}
        onChange={(event) => setCount(Number.parseInt(event.target.value, 10))}
        aria-label="Number of identities"
        style={{ ...fieldStyle, width: 72 }}
      />
      <select
        value={device}
        onChange={(event) => setDevice(event.target.value === "mobile" ? "mobile" : "desktop")}
        aria-label="Identity device"
        style={fieldStyle}
      >
        <option value="desktop">Desktop</option>
        <option value="mobile">Mobile</option>
      </select>
      <CountrySelect
        countries={countries}
        value={country}
        onChange={(code) => {
          setCountry(code);
          setCity("");
        }}
        allowCustom
        style={fieldStyle}
      />
      {!isCustom && (
        <select
          value={city}
          onChange={(event) => setCity(event.target.value)}
          aria-label="Identity city"
          style={fieldStyle}
        >
          <option value="">Mixed (population-weighted)</option>
          {cities.map((row) => (
            <option key={row.city} value={row.city}>
              {row.city}, {row.region}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        style={primaryButtonStyle("#6155dc", busy || !valid)}
        disabled={busy || !valid}
        onClick={submit}
      >
        {busy ? "Creating..." : `Create ${validCount ? count : ""} identit${count === 1 ? "y" : "ies"}`}
      </button>
      {isCustom && <CustomLocationFields value={custom} onChange={setCustom} fieldStyle={fieldStyle} />}
    </div>
  );
}
