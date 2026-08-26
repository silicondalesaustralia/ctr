"use client";

import type { CampaignFormState, IntensitySummary, QueryRow, SettingRationale } from "./shared";
import {
  cellStyle,
  inputStyle,
  labelStyle,
  panelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  thStyle,
} from "./shared";

interface Props {
  form: CampaignFormState;
  intensity: IntensitySummary | null;
  rationales: SettingRationale[];
  gscStatus: "live" | "unavailable" | null;
  running: boolean;
  busy: string | null;
  onFormChange: <K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) => void;
  onQueryChange: (index: number, field: keyof QueryRow, value: string) => void;
  onBack: () => void;
  onReanalyze: () => void;
  onPreview: () => void;
  onCreateIdentities: () => void;
  onSaveAndStart: () => void;
  onStop: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export default function CampaignReviewStep({
  form,
  intensity,
  rationales,
  gscStatus,
  running,
  busy,
  onFormChange,
  onQueryChange,
  onBack,
  onReanalyze,
  onPreview,
  onCreateIdentities,
  onSaveAndStart,
  onStop,
}: Props) {
  return (
    <>
      <section style={panelStyle}>
        <p style={{ color: "#64748b", margin: "0 0 8px", fontSize: 14 }}>Step 2 of 2</p>
        <h2 style={{ margin: "0 0 8px" }}>Review recommended plan</h2>
        <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 15 }}>
          Settings were chosen from GSC data and your keyword cluster. Adjust anything below,
          then save and start when ready.
        </p>

        {gscStatus && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              marginBottom: 20,
              background: gscStatus === "live" ? "#ecfdf5" : "#f8fafc",
              border: `1px solid ${gscStatus === "live" ? "#6ee7b7" : "#e2e8f0"}`,
              fontSize: 14,
            }}
          >
            {gscStatus === "live"
              ? "GSC data loaded for this URL (AU, last 28 days)."
              : "GSC data unavailable — recommendations use keyword variations and defaults."}
          </div>
        )}

        {rationales.length > 0 ? (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Why these settings</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {rationales.map((item) => (
                <div
                  key={item.setting}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong>{item.setting}</strong>
                    <span style={{ color: "#2563eb", fontWeight: 600 }}>{item.value}</span>
                  </div>
                  <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>{item.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>
            No analysis notes saved. Use Re-analyze to fetch GSC and regenerate explanations.
          </p>
        )}

        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Campaign settings</h3>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label>
              <span style={labelStyle}>Duration (days)</span>
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={form.campaignDurationDays}
                onChange={(e) => onFormChange("campaignDurationDays", Number(e.target.value))}
                disabled={running}
              />
            </label>
            <label>
              <span style={labelStyle}>Treatment intensity</span>
              <select
                style={inputStyle}
                value={form.treatmentIntensity}
                onChange={(e) => onFormChange("treatmentIntensity", e.target.value)}
                disabled={running}
              >
                <option value="low">Low (1.25×)</option>
                <option value="normal">Normal (1.5×)</option>
                <option value="strong">Strong (2×)</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <label>
              <span style={labelStyle}>Desktop mix %</span>
              <input
                style={inputStyle}
                type="number"
                min={0}
                max={100}
                value={form.desktopPercent}
                onChange={(e) => onFormChange("desktopPercent", Number(e.target.value))}
                disabled={running}
              />
            </label>
            <label>
              <span style={labelStyle}>CTR source</span>
              <select
                style={inputStyle}
                value={form.ctrSource}
                onChange={(e) => onFormChange("ctrSource", e.target.value)}
                disabled={running}
              >
                <option value="default_curve">Default curve</option>
                <option value="gsc_site_curve">GSC site curve</option>
              </select>
            </label>
            <label>
              <span style={labelStyle}>Max share of demand</span>
              <input
                style={inputStyle}
                type="number"
                step={0.001}
                min={0.001}
                max={0.1}
                value={form.maxShareOfSearchDemand}
                onChange={(e) => onFormChange("maxShareOfSearchDemand", Number(e.target.value))}
                disabled={running}
              />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24 }}>
              <input
                type="checkbox"
                checked={form.adaptivePacing}
                onChange={(e) => onFormChange("adaptivePacing", e.target.checked)}
                disabled={running}
              />
              <span>Rank-adaptive pacing</span>
            </label>
            <label>
              <span style={labelStyle}>Recalculate every (days)</span>
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={form.recalculateEveryDays}
                onChange={(e) => onFormChange("recalculateEveryDays", Number(e.target.value))}
                disabled={running || !form.adaptivePacing}
              />
            </label>
            <label>
              <span style={labelStyle}>Max share of GSC impressions</span>
              <input
                style={inputStyle}
                type="number"
                step={0.001}
                min={0.001}
                max={0.2}
                value={form.maxShareOfGscImpressions}
                onChange={(e) => onFormChange("maxShareOfGscImpressions", Number(e.target.value))}
                disabled={running}
              />
            </label>
          </div>
        </div>

        {running && (
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 16 }}>
            Campaign is running. Stop it to edit settings.
          </p>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          {!running && (
            <button type="button" onClick={onBack} disabled={Boolean(busy)} style={secondaryButtonStyle}>
              Back
            </button>
          )}
          {!running && (
            <button type="button" onClick={onReanalyze} disabled={Boolean(busy)} style={secondaryButtonStyle}>
              {busy === "analyze" ? "Analyzing..." : "Re-analyze GSC"}
            </button>
          )}
          {!running && (
            <button type="button" onClick={onPreview} disabled={Boolean(busy)} style={secondaryButtonStyle}>
              {busy === "preview" ? "Calculating..." : "Update preview"}
            </button>
          )}
          {!running ? (
            <button
              type="button"
              onClick={onSaveAndStart}
              disabled={Boolean(busy) || !form.keyword || !form.targetUrl}
              style={primaryButtonStyle("#16a34a")}
            >
              {busy === "run" ? "Starting..." : "Save & start campaign"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              disabled={Boolean(busy)}
              style={primaryButtonStyle("#dc2626")}
            >
              {busy === "stop" ? "Stopping..." : "Stop campaign"}
            </button>
          )}
        </div>
      </section>

      {intensity && (
        <section style={{ ...panelStyle, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px" }}>Session plan</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 16,
            }}
          >
            <Stat label="Baseline clicks" value={String(intensity.totalBaselineClicks)} />
            <Stat label="Planned sessions" value={String(intensity.totalAllocatedSessions)} />
            <Stat label="Treatment ×" value={String(intensity.treatmentMultiplier)} />
            <Stat label="Active identities" value={String(intensity.activeIdentityCount ?? "—")} />
            <Stat label="Suggested identities" value={String(intensity.suggestedIdentities)} />
            {intensity.feasibleSessions != null && (
              <Stat label="Feasible w/ pool" value={String(intensity.feasibleSessions)} />
            )}
          </div>

          {intensity.identityDeficit != null && intensity.identityDeficit > 0 && (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fcd34d",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>Need {intensity.identityDeficit} more identities</strong>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
                  You have {intensity.activeIdentityCount} active but this campaign needs{" "}
                  {intensity.suggestedIdentities}. Only {intensity.feasibleSessions} of{" "}
                  {intensity.totalAllocatedSessions} sessions can run with the current pool.
                </p>
              </div>
              <button
                type="button"
                onClick={onCreateIdentities}
                disabled={Boolean(busy) || running}
                style={primaryButtonStyle("#2563eb")}
              >
                {busy === "identities"
                  ? "Creating..."
                  : `Create ${intensity.identityDeficit} identities`}
              </button>
            </div>
          )}
        </section>
      )}

      {form.queries.length > 0 && (
        <section style={{ ...panelStyle, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 16px" }}>Query cluster</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Query", "Type", "Volume/mo", "Position", "GSC impr.", "GSC clicks", "Sessions"].map(
                    (h) => (
                      <th key={h} style={thStyle}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {form.queries.map((row, index) => (
                  <tr key={row.text}>
                    <td style={cellStyle}>{row.text}</td>
                    <td style={cellStyle}>{row.type}</td>
                    <td style={cellStyle}>
                      <input
                        style={{ ...inputStyle, padding: "6px 8px", width: 90 }}
                        type="number"
                        value={row.monthlySearchVolume ?? ""}
                        onChange={(e) => onQueryChange(index, "monthlySearchVolume", e.target.value)}
                        disabled={running}
                        placeholder="—"
                      />
                    </td>
                    <td style={cellStyle}>
                      <input
                        style={{ ...inputStyle, padding: "6px 8px", width: 70 }}
                        type="number"
                        step={0.1}
                        value={row.startingPosition ?? ""}
                        onChange={(e) => onQueryChange(index, "startingPosition", e.target.value)}
                        disabled={running}
                        placeholder="—"
                      />
                    </td>
                    <td style={cellStyle}>{row.gscImpressions28d ?? "—"}</td>
                    <td style={cellStyle}>{row.gscClicks28d ?? "—"}</td>
                    <td style={cellStyle}>{row.allocatedSessions ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
