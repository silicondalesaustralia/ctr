"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import type { GmbActionFlags } from "./shared";
import { inputStyle, labelStyle, panelStyle, primaryButtonStyle, secondaryButtonStyle } from "./shared";

export interface CityOption {
  city: string;
  region: string;
  timezone: string;
}

export interface GeoCapacity {
  city: string;
  region: string;
  active: number;
  eligible: number;
  warming: number;
  suggested: number;
  deficit: number;
  proxyCity: string;
}

interface Props {
  keyword: string;
  gmbBusinessName: string;
  gmbMapsUrl: string;
  focusCity: string;
  gmbActions: GmbActionFlags;
  cities: CityOption[];
  busy: boolean;
  onKeywordChange: (value: string) => void;
  onBusinessNameChange: (value: string) => void;
  onMapsUrlChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onActionsChange: (value: GmbActionFlags) => void;
  onAnalyze: () => void;
  onBack: () => void;
}

export default function CampaignGmbSetupStep({
  keyword,
  gmbBusinessName,
  gmbMapsUrl,
  focusCity,
  gmbActions,
  cities,
  busy,
  onKeywordChange,
  onBusinessNameChange,
  onMapsUrlChange,
  onCityChange,
  onActionsChange,
  onAnalyze,
  onBack,
}: Props) {
  const [capacity, setCapacity] = useState<GeoCapacity | null>(null);
  const [capacityError, setCapacityError] = useState<string | null>(null);

  useEffect(() => {
    if (!focusCity) {
      setCapacity(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await apiGet<GeoCapacity>(
          `/campaign/geo-capacity?city=${encodeURIComponent(focusCity)}&suggested=0`,
        );
        if (!cancelled) {
          setCapacity(result);
          setCapacityError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setCapacity(null);
          setCapacityError(err instanceof Error ? err.message : "Failed to load capacity");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusCity]);

  const canAnalyze = Boolean(
    keyword.trim() && gmbBusinessName.trim() && gmbMapsUrl.trim() && focusCity,
  );

  return (
    <section style={panelStyle}>
      <p style={{ color: "#64748b", margin: "0 0 8px", fontSize: 14 }}>Step 1 of 2 · GMB</p>
      <h2 style={{ margin: "0 0 8px" }}>Google Business Profile</h2>
      <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 15 }}>
        Target a Maps listing from the local pack. Geo locks proxies and identities to that city.
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        <label>
          <span style={labelStyle}>Business name</span>
          <input
            style={inputStyle}
            value={gmbBusinessName}
            onChange={(e) => onBusinessNameChange(e.target.value)}
            placeholder="e.g. Adelaide Equine Clinic"
          />
        </label>

        <label>
          <span style={labelStyle}>Maps URL / Place ID / CID</span>
          <input
            style={inputStyle}
            value={gmbMapsUrl}
            onChange={(e) => onMapsUrlChange(e.target.value)}
            placeholder="https://www.google.com/maps/place/... or ChIJ..."
          />
        </label>

        <label>
          <span style={labelStyle}>Primary keyword</span>
          <input
            style={inputStyle}
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder="e.g. horse vet Adelaide"
          />
        </label>

        <label>
          <span style={labelStyle}>Geo location</span>
          <select
            style={inputStyle}
            value={focusCity}
            onChange={(e) => onCityChange(e.target.value)}
          >
            <option value="">Select city</option>
            {cities.map((option) => (
              <option key={option.city} value={option.city}>
                {option.city} ({option.region})
              </option>
            ))}
          </select>
        </label>

        {capacity && (
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 14,
              fontSize: 14,
            }}
          >
            <strong>{capacity.city} capacity:</strong> {capacity.eligible} eligible ·{" "}
            {capacity.warming} warming · {capacity.active} active
            <div style={{ color: "#64748b", marginTop: 4 }}>
              Proxies will use city-{capacity.proxyCity}. Create more identities after analyze if
              the plan needs a larger pool.
            </div>
          </div>
        )}
        {capacityError && (
          <p style={{ color: "#b45309", margin: 0, fontSize: 14 }}>{capacityError}</p>
        )}

        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, margin: 0 }}>
          <legend style={{ padding: "0 6px", fontWeight: 600, fontSize: 14 }}>
            Actions after opening listing
          </legend>
          <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 13 }}>
            Open listing is always included.
          </p>
          {(
            [
              ["website", "Website"],
              ["directions", "Get directions"],
              ["call", "Call"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}
            >
              <input
                type="checkbox"
                checked={gmbActions[key]}
                onChange={(e) => onActionsChange({ ...gmbActions, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={secondaryButtonStyle(busy)} disabled={busy}>
          Back
        </button>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={busy || !canAnalyze}
          style={primaryButtonStyle("#2563eb")}
        >
          {busy ? "Building GMB plan..." : "Analyze & recommend settings"}
        </button>
      </div>
    </section>
  );
}
