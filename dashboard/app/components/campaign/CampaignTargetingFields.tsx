"use client";

import { useEffect, useState } from "react";
import type { CampaignFormState, IdentityPool } from "./shared";
import HintLabel from "./HintLabel";
import { inputStyle } from "./shared";

interface Props {
  form: CampaignFormState;
  running: boolean;
  onFormChange: <K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) => void;
}

const POOL_OPTIONS: Array<{ value: IdentityPool; title: string; detail: string }> = [
  {
    value: "warmed",
    title: "Warmed identities only",
    detail: "Only identities that finished warmup (browse + benign search + graduation).",
  },
  {
    value: "any",
    title: "Any identity, including unwarmed",
    detail: "Cold identities can run straight away. Camoufox passed cold in testing.",
  },
];

function formatPoint(lat: number | null, lng: number | null): string {
  return lat !== null && lng !== null ? `${lat}, ${lng}` : "";
}

function parsePoint(text: string): { lat: number; lng: number } | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export default function CampaignTargetingFields({ form, running, onFormChange }: Props) {
  const [pointText, setPointText] = useState(formatPoint(form.geoLatitude, form.geoLongitude));
  const [pointError, setPointError] = useState<string | null>(null);

  useEffect(() => {
    setPointText(formatPoint(form.geoLatitude, form.geoLongitude));
  }, [form.geoLatitude, form.geoLongitude]);

  function commitPoint() {
    if (!pointText.trim()) {
      setPointError(null);
      onFormChange("geoLatitude", null);
      onFormChange("geoLongitude", null);
      return;
    }
    const point = parsePoint(pointText);
    if (!point) {
      setPointError("Paste as “latitude, longitude”, e.g. -35.0666, 138.8583");
      return;
    }
    setPointError(null);
    onFormChange("geoLatitude", point.lat);
    onFormChange("geoLongitude", point.lng);
  }

  return (
    <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, margin: 0 }}>
      <legend style={{ padding: "0 6px", fontWeight: 600, fontSize: 14 }}>
        Identities &amp; GPS targeting
      </legend>
      {POOL_OPTIONS.map((option) => (
        <label
          key={option.value}
          style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}
        >
          <input
            type="radio"
            name="identityPool"
            checked={form.identityPool === option.value}
            disabled={running}
            onChange={() => onFormChange("identityPool", option.value)}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>{option.title}</strong>
            <div style={{ color: "#64748b", fontSize: 13 }}>{option.detail}</div>
          </span>
        </label>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 6 }}>
        <label>
          <HintLabel
            label="GPS centre (optional)"
            hint="Right-click a spot in Google Maps and copy the coordinates. Each identity gets its own fixed point inside the radius, so browser location matches a real local searcher. Leave blank to skip GPS."
          />
          <input
            style={inputStyle}
            placeholder="-35.0666, 138.8583"
            value={pointText}
            disabled={running}
            onChange={(e) => setPointText(e.target.value)}
            onBlur={commitPoint}
          />
          {pointError && <div style={{ color: "#b91c1c", fontSize: 12 }}>{pointError}</div>}
        </label>
        <label>
          <HintLabel label="Radius (km)" hint="Spread of identity GPS points around the centre. Default 3 km." />
          <input
            style={inputStyle}
            type="number"
            min={0.5}
            max={50}
            step={0.5}
            placeholder="3"
            value={form.geoRadiusKm ?? ""}
            disabled={running}
            onChange={(e) =>
              onFormChange("geoRadiusKm", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </label>
      </div>
    </fieldset>
  );
}
