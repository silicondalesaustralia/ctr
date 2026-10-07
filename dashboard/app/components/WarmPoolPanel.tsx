"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPut } from "../../lib/api";
import { DEFAULT_COUNTRY, useCountries } from "../../lib/geo";
import CountrySelect from "./CountrySelect";
import {
  normalizePool,
  warmPoolKey,
  type DeviceTargetInputs,
  type PoolDevice,
  type RawWarmPoolResponse,
  type WarmPoolResponse,
} from "../../lib/warm-pool";
import WarmPoolRow from "./WarmPoolRow";
import { inputStyle, panelStyle, primaryButtonStyle, thStyle } from "./campaign/shared";

export default function WarmPoolPanel() {
  const { countries } = useCountries();
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [pool, setPool] = useState<WarmPoolResponse | null>(null);
  const [targets, setTargets] = useState<Record<string, DeviceTargetInputs>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyPool = useCallback((raw: RawWarmPoolResponse) => {
    const result = normalizePool(raw);
    setPool(result);
    setTargets(
      Object.fromEntries(
        result.cities.map((row) => [
          row.key,
          { desktop: String(row.desktop.target), mobile: String(row.mobile.target) },
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        applyPool(await apiGet<RawWarmPoolResponse>("/settings/warm-pool"));
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
        Object.entries(targets).map(([city, value]) => [
          city,
          { desktop: Number(value.desktop || 0), mobile: Number(value.mobile || 0) },
        ]),
      );
      applyPool(await apiPut<RawWarmPoolResponse>("/settings/warm-pool", { targets: payload }));
      setMessage("Warm pool saved — missing identities are created automatically (up to 3 per hour).");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save warm pool");
    } finally {
      setSaving(false);
    }
  }

  const cities = countries.find((row) => row.code === country)?.cities ?? [];
  const statusFor = (key: string) => pool?.cities.find((row) => row.key === key);
  const setTarget = (key: string, device: PoolDevice, value: string) =>
    setTargets((prev) => ({
      ...prev,
      [key]: { desktop: prev[key]?.desktop ?? "", mobile: prev[key]?.mobile ?? "", [device]: value },
    }));

  return (
    <section style={{ ...panelStyle, marginBottom: 20 }}>
      <h2 style={{ margin: "0 0 8px" }}>Warm pool</h2>
      <p style={{ color: "#767d8e", margin: "0 0 12px", fontSize: 14 }}>
        How many Camoufox identities to keep per city and device (warming + warm). The worker tops up
        hourly and gives warm identities a browse session after 7 idle days. No seat limit.
        {pool && !pool.mobileAvailable && " Mobile targets need a mobile proxy pool (MOBILE_PROXY_PROVIDER)."}
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
            {["City", "Desktop target", "Mobile target", "Warming (D / M)", "Warm (D / M)"].map((header) => (
              <th key={header} style={thStyle}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cities.map((option) => {
            const key = warmPoolKey(country, option.city);
            const status = statusFor(key);
            return (
              <WarmPoolRow
                key={key}
                city={option.city}
                targets={targets[key]}
                status={status && { desktop: status.desktop, mobile: status.mobile }}
                mobileAvailable={pool?.mobileAvailable ?? false}
                onChange={(device, value) => setTarget(key, device, value)}
              />
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
