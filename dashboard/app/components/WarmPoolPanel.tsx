"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPut } from "../../lib/api";
import { DEFAULT_COUNTRY, useCountries } from "../../lib/geo";
import CountrySelect from "./CountrySelect";
import { cellStyle, inputStyle, panelStyle, primaryButtonStyle, thStyle } from "./campaign/shared";

function warmPoolKey(country: string, city: string): string {
  return country === DEFAULT_COUNTRY ? city : `${country}:${city}`;
}

interface WarmPoolCity {
  key?: string;
  country?: string;
  city: string;
  target: number;
  warming: number;
  eligible: number;
}

interface WarmPoolResponse {
  provider: string;
  cities: WarmPoolCity[];
}

export default function WarmPoolPanel() {
  const { countries } = useCountries();
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [pool, setPool] = useState<WarmPoolResponse | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyPool = useCallback((result: WarmPoolResponse) => {
    setPool(result);
    setTargets(Object.fromEntries(result.cities.map((row) => [row.key ?? row.city, String(row.target)])));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        applyPool(await apiGet<WarmPoolResponse>("/settings/warm-pool"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load warm pool");
      }
    })();
  }, [applyPool]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(targets).map(([city, value]) => [city, Number(value || 0)]),
      );
      applyPool(await apiPut<WarmPoolResponse>("/settings/warm-pool", { targets: payload }));
      setMessage("Warm pool saved — missing identities are created automatically (up to 3 per hour).");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save warm pool");
    } finally {
      setSaving(false);
    }
  }

  const cities = countries.find((row) => row.code === country)?.cities ?? [];
  const statusFor = (key: string) => pool?.cities.find((row) => (row.key ?? row.city) === key);

  return (
    <section style={{ ...panelStyle, marginBottom: 20 }}>
      <h2 style={{ margin: "0 0 8px" }}>Warm pool</h2>
      <p style={{ color: "#767d8e", margin: "0 0 12px", fontSize: 14 }}>
        How many Camoufox identities to keep per city (warming + warm). The worker tops up hourly and
        gives warm identities a browse session after 7 idle days. No seat limit.
        {pool && pool.provider !== "camoufox" && (
          <strong style={{ color: "#b45309" }}> Inactive: browser provider is {pool.provider}.</strong>
        )}
      </p>
      <CountrySelect
        countries={countries}
        value={country}
        onChange={setCountry}
        style={{ ...inputStyle, width: "auto", marginBottom: 12 }}
      />
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 12 }}>
        <thead>
          <tr style={{ background: "#fafbfc" }}>
            {["City", "Target", "Warming", "Warm"].map((header) => (
              <th key={header} style={thStyle}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cities.map((option) => {
            const key = warmPoolKey(country, option.city);
            return (
              <tr key={key}>
                <td style={cellStyle}>{option.city}</td>
                <td style={cellStyle}>
                  <input
                    style={{ ...inputStyle, width: 90, padding: "6px 8px" }}
                    type="number"
                    min={0}
                    max={50}
                    value={targets[key] ?? ""}
                    placeholder="0"
                    onChange={(e) => setTargets((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </td>
                <td style={cellStyle}>{statusFor(key)?.warming ?? "—"}</td>
                <td style={cellStyle}>{statusFor(key)?.eligible ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        style={primaryButtonStyle("#6155dc", saving)}
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? "Saving..." : "Save warm pool"}
      </button>
      {message && <p style={{ color: "#198366", margin: "12px 0 0" }}>{message}</p>}
      {error && <p style={{ color: "#bf4352", margin: "12px 0 0" }}>{error}</p>}
    </section>
  );
}
