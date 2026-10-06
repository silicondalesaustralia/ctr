"use client";

import type { CampaignFormState, IdentityPool } from "./shared";
import GpsPointInput from "./GpsPointInput";
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

export default function CampaignTargetingFields({ form, running, onFormChange }: Props) {
  return (
    <fieldset style={{ border: "1px solid #e9ecf2", borderRadius: 8, padding: 14, margin: 0 }}>
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
            <div style={{ color: "#767d8e", fontSize: 13 }}>{option.detail}</div>
          </span>
        </label>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 6 }}>
        <GpsPointInput
          label="GPS centre (optional)"
          hint="Right-click a spot in Google Maps and copy the coordinates. Each identity gets its own fixed point inside the radius, so browser location matches a real local searcher. Leave blank to skip GPS."
          placeholder="Blank = no GPS (e.g. -35.0666, 138.8583)"
          latitude={form.geoLatitude}
          longitude={form.geoLongitude}
          disabled={running}
          onChange={(lat, lng) => {
            onFormChange("geoLatitude", lat);
            onFormChange("geoLongitude", lng);
          }}
        />
        <label>
          <HintLabel label="Radius (km)" hint="Spread of identity GPS points around the centre. Default 3 km." />
          <input
            style={inputStyle}
            type="number"
            min={0.5}
            max={50}
            step={0.5}
            placeholder="Default 3"
            value={form.geoRadiusKm ?? ""}
            disabled={running}
            onChange={(e) =>
              onFormChange("geoRadiusKm", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <GpsPointInput
          label="Rank check location (optional)"
          hint="Where daily and manual rank checks search from — set it to the spot you test with your location checker (e.g. the town centre named in the keyword). Leave blank to use the campaign city's centre. Don't use the business's own address: it ranks #1 there."
          placeholder="Blank = campaign city centre (e.g. -34.9285, 138.6007)"
          latitude={form.rankCheckLatitude}
          longitude={form.rankCheckLongitude}
          disabled={running}
          onChange={(lat, lng) => {
            onFormChange("rankCheckLatitude", lat);
            onFormChange("rankCheckLongitude", lng);
          }}
        />
      </div>
    </fieldset>
  );
}
