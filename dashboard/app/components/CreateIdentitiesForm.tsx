"use client";

import { useState } from "react";
import { primaryButtonStyle } from "./campaign/shared";

const MAX_BATCH = 50;

const CITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Mixed (population-weighted)" },
  { value: "Sydney", label: "Sydney, NSW" },
  { value: "Melbourne", label: "Melbourne, VIC" },
  { value: "Brisbane", label: "Brisbane, QLD" },
  { value: "Perth", label: "Perth, WA" },
  { value: "Adelaide", label: "Adelaide, SA" },
  { value: "Darwin", label: "Darwin, NT" },
  { value: "Hobart", label: "Hobart, TAS (poor proxy coverage)" },
  { value: "Canberra", label: "Canberra, ACT (poor proxy coverage)" },
];

interface CreateIdentitiesFormProps {
  busy: boolean;
  onCreate: (count: number, city: string | null) => void;
}

export default function CreateIdentitiesForm({ busy, onCreate }: CreateIdentitiesFormProps) {
  const [count, setCount] = useState(5);
  const [city, setCity] = useState("");
  const valid = Number.isInteger(count) && count >= 1 && count <= MAX_BATCH;

  const fieldStyle = {
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
        value={city}
        onChange={(event) => setCity(event.target.value)}
        aria-label="Identity location"
        style={fieldStyle}
      >
        {CITY_OPTIONS.map((option) => (
          <option key={option.value || "mixed"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        style={primaryButtonStyle("#2563eb", busy || !valid)}
        disabled={busy || !valid}
        onClick={() => onCreate(count, city || null)}
      >
        {busy ? "Creating..." : `Create ${valid ? count : ""} identit${count === 1 ? "y" : "ies"}`}
      </button>
    </div>
  );
}
