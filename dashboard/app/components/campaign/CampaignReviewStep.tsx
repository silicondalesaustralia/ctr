"use client";

import type { CampaignFormState, IntensitySummary, PreflightSummary, QueryRow, SettingRationale } from "./shared";
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
  preflightSummary: PreflightSummary | null;
  running: boolean;
  busy: string | null;
  message: string | null;
  error: string | null;
  onFormChange: <K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) => void;
  onQueryChange: (index: number, field: keyof QueryRow, value: string) => void;
  onBack: () => void;
  onReanalyze: () => void;
  onPreflight: () => void;
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
  preflightSummary,
  running,
  busy,
  message,
  error,
  onFormChange,
  onQueryChange,
  onBack,
  onReanalyze,
  onPreflight,
  onPreview,
  onCreateIdentities,
  onSaveAndStart,
  onStop,
}: Props) {
  const preflightReady =
    preflightSummary != null &&
    preflightSummary.findableCount > 0 &&
    preflightSummary.status !== "blocked";
  const removedQueries =
    preflightSummary?.results.filter((row) => !row.found).map((row) => row.query) ?? [];
  return (
    <>
      <section style={panelStyle}>
        <p style={{ color: "#64748b", margin: "0 0 8px", fontSize: 14 }}>Step 2 of 2</p>
        <h2 style={{ margin: "0 0 8px" }}>Review recommended plan</h2>
        <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 15 }}>
          Settings were chosen from GSC data and your keyword cluster. Adjust anything below,
          then save and start when ready.
        </p>

        {(message || error) && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              marginBottom: 20,
              background: error ? "#fef2f2" : "#eff6ff",
              border: `1px solid ${error ? "#fecaca" : "#bfdbfe"}`,
              fontSize: 14,
              color: error ? "#b91c1c" : "#1d4ed8",
            }}
          >
            {error ?? message}
          </div>
        )}

        {preflightSummary && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              marginBottom: 20,
              background:
                preflightSummary.status === "blocked"
                  ? "#fef2f2"
                  : preflightSummary.findableCount > 0
                    ? "#ecfdf5"
                    : "#fffbeb",
              border: `1px solid ${
                preflightSummary.status === "blocked"
                  ? "#fecaca"
                  : preflightSummary.findableCount > 0
                    ? "#6ee7b7"
                    : "#fcd34d"
              }`,
              fontSize: 14,
            }}
          >
            {preflightSummary.status === "blocked"
              ? "Google blocked the preflight browser session (CAPTCHA). Retry later or switch identity."
              : preflightSummary.findableCount > 0
                ? `Google preflight: ${preflightSummary.findableCount} of ${preflightSummary.testedCount} queries findable within 3 pages.${
                    preflightSummary.keywordAdjusted
                      ? ` Primary keyword updated to "${form.keyword}".`
                      : ""
                  }`
                : "Google preflight: none of the queries showed your site in the first 3 SERP pages."}
          </div>
        )}

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
            <button type="button" onClick={onPreflight} disabled={Boolean(busy)} style={secondaryButtonStyle}>
              {busy === "preflight" ? "Checking Google..." : "Validate on Google"}
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
              disabled={Boolean(busy) || !form.keyword || !form.targetUrl || !preflightReady}
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
        {!running && !preflightReady && (
          <p style={{ color: "#b45309", fontSize: 14, marginTop: 12 }}>
            Run Validate on Google before starting — only findable queries can be scheduled.
          </p>
        )}
      </section>

      {intensity && (
        <section style={{ ...panelStyle, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px" }}>Session plan</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <Stat label="Baseline clicks" value={String(intensity.totalBaselineClicks)} />
            <Stat label="Treatment ×" value={String(intensity.treatmentMultiplier)} />
            <Stat label="Active identities" value={String(intensity.activeIdentityCount ?? "—")} />
            {intensity.feasibleSessions != null && (
              <Stat label="Feasible w/ pool" value={String(intensity.feasibleSessions)} />
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <label>
              <span style={labelStyle}>Planned sessions</span>
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={form.plannedSessionCap ?? intensity.totalAllocatedSessions}
                onChange={(e) => onFormChange("plannedSessionCap", Number(e.target.value))}
                disabled={running}
              />
            </label>
            <label>
              <span style={labelStyle}>Target identities</span>
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={form.targetIdentityCount ?? intensity.suggestedIdentities}
                onChange={(e) => onFormChange("targetIdentityCount", Number(e.target.value))}
                disabled={running}
              />
            </label>
            <label>
              <span style={labelStyle}>Max sessions per identity</span>
              <input
                style={inputStyle}
                type="number"
                min={1}
                max={10}
                value={form.organicMaxSessionsPerIdentity}
                onChange={(e) =>
                  onFormChange("organicMaxSessionsPerIdentity", Number(e.target.value))
                }
                disabled={running}
              />
            </label>
          </div>
          <p style={{ margin: "12px 0 0", color: "#64748b", fontSize: 13 }}>
            Organic traffic is mostly unique visitors. Use 1 for all-unique sessions, or 2 if a few
            may return. Click Update preview after changing these.
          </p>

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
                  You have {intensity.activeIdentityCount} active but organic traffic needs about{" "}
                  {intensity.suggestedIdentities} mostly-unique visitors (max 2 sessions each). The
                  pool can still schedule {intensity.feasibleSessions} of{" "}
                  {intensity.totalAllocatedSessions} sessions with identity reuse.
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

      {(form.queries.length > 0 || (preflightSummary?.results.length ?? 0) > 0) && (
        <section style={{ ...panelStyle, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 16px" }}>Query cluster</h2>
          {removedQueries.length > 0 && (
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 12px" }}>
              Removed after preflight: {removedQueries.join(", ")}
            </p>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {[
                    "Query",
                    "Type",
                    "Google",
                    "Volume/mo",
                    "Position",
                    "GSC impr.",
                    "GSC clicks",
                    "Sessions",
                  ].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.queries.map((row, index) => {
                  const preflight = preflightSummary?.results.find(
                    (item) => item.query.toLowerCase() === row.text.toLowerCase(),
                  );
                  const googleLabel =
                    preflight?.found
                      ? `p${preflight.serpPage} #${preflight.position}`
                      : preflight
                        ? "Not found"
                        : "—";
                  return (
                    <tr key={row.text}>
                      <td style={cellStyle}>{row.text}</td>
                      <td style={cellStyle}>{row.type}</td>
                      <td style={cellStyle}>{googleLabel}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
