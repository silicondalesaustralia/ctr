"use client";

import type { CampaignFormState, IntensitySummary, PreflightSummary, QueryRow, SettingRationale } from "./shared";
import HintLabel from "./HintLabel";
import {
  cellStyle,
  getStartCampaignBlockReason,
  inputStyle,
  labelStyle,
  panelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  thStyle,
} from "./shared";
import { AU_TIMEZONE_OPTIONS } from "../../../lib/format-timezone";

const CAMPAIGN_SETTING_HINTS = {
  duration:
    "How many days to spread sessions across. Use 3 for a dense burst, 7 for a short batch, or 14–21 for quieter organic pacing. Short windows auto-relax identity spacing so the queue can still fill.",
  treatmentIntensity:
    "Multiplier applied to expected baseline clicks from GSC. Low = 1.25×, Normal = 1.5×, Strong = 2×. Use Strong for deeper rankings.",
  desktopPercent:
    "Share of browser sessions that use a desktop profile vs mobile. Match how your GSC traffic splits if you know it.",
  ctrSource:
    "How expected click-through rate is estimated from ranking position. Default curve is industry average; GSC site curve uses your property history.",
  maxShareOfSearchDemand:
    "Safety cap: treatment sessions will not exceed this fraction of estimated total search volume for your query cluster (default 2%).",
  adaptivePacing:
    "When enabled, the session budget is recalculated during the campaign as GSC positions and impressions change.",
  recalculateEveryDays:
    "With rank-adaptive pacing on, how often the platform recalculates how many sessions each query should receive.",
  maxShareOfGscImpressions:
    "Safety cap: treatment sessions will not exceed this fraction of your page's GSC impressions in the last 28 days (default 5%).",
} as const;

const SCHEDULE_WINDOW_PRESETS = [
  { days: 3, label: "Burst 3d" },
  { days: 7, label: "Short 7d" },
  { days: 14, label: "Standard 14d" },
  { days: 21, label: "Long 21d" },
] as const;

interface Props {
  form: CampaignFormState;
  intensity: IntensitySummary | null;
  rationales: SettingRationale[];
  gscStatus: "live" | "unavailable" | null;
  preflightSummary: PreflightSummary | null;
  running: boolean;
  campaignStatus?: string | null;
  busy: string | null;
  message: string | null;
  error: string | null;
  onFormChange: <K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) => void;
  onQueryChange: (index: number, field: keyof QueryRow, value: string) => void;
  onToggleQueryActive: (index: number, active: boolean) => void;
  onBack: () => void;
  onReanalyze: () => void;
  onPreflight: () => void;
  onPreview: () => void;
  onCreateIdentities: () => void;
  onSave: () => void;
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
  campaignStatus = null,
  busy,
  message,
  error,
  onFormChange,
  onQueryChange,
  onToggleQueryActive,
  onBack,
  onReanalyze,
  onPreflight,
  onPreview,
  onCreateIdentities,
  onSave,
  onSaveAndStart,
  onStop,
}: Props) {
  const startBlockReason = getStartCampaignBlockReason(
    form,
    preflightSummary,
    campaignStatus,
  );
  const startDisabled = Boolean(busy) || Boolean(startBlockReason);
  const isGmb = form.campaignKind === "gmb";
  const notFoundQueries =
    preflightSummary?.results.filter((row) => !row.found).map((row) => row.query) ?? [];
  return (
    <>
      <section style={panelStyle}>
        <p style={{ color: "#64748b", margin: "0 0 8px", fontSize: 14 }}>Step 2 of 2</p>
        <h2 style={{ margin: "0 0 8px" }}>
          {isGmb ? "Review GMB / Places campaign" : "Review recommended plan"}
        </h2>
        <p style={{ color: "#64748b", margin: "0 0 20px", fontSize: 15 }}>
          {isGmb
            ? "Settings are for Google Business Profile / Places rankings. Adjust below, save, then validate Places ranks before starting."
            : "Settings were chosen from GSC data and your keyword cluster. Adjust anything below, save your draft, then validate on Google before starting."}
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
                ? form.campaignKind === "gmb"
                  ? `Local pack / More places: ${preflightSummary.findableCount} of ${preflightSummary.testedCount} queries findable.${
                      preflightSummary.keywordAdjusted
                        ? ` Primary keyword updated to "${form.keyword}".`
                        : ""
                    }`
                  : `Google preflight: ${preflightSummary.findableCount} of ${preflightSummary.testedCount} queries findable within 3 pages.${
                      preflightSummary.keywordAdjusted
                        ? ` Primary keyword updated to "${form.keyword}".`
                        : ""
                    }`
                : form.campaignKind === "gmb"
                  ? "Local pack / More places: none of the queries showed your listing (checked top pack and More places)."
                  : "Google preflight: none of the queries showed your site in the first 3 SERP pages."}
          </div>
        )}

        {gscStatus && !isGmb && (
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

        {isGmb && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              marginBottom: 20,
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              fontSize: 14,
            }}
          >
            GMB campaign — ranks come from Google local pack / More places (not organic SERP or GSC).
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
              <HintLabel label="Schedule window (days)" hint={CAMPAIGN_SETTING_HINTS.duration} />
              <input
                style={inputStyle}
                type="number"
                min={1}
                max={90}
                value={form.campaignDurationDays}
                onChange={(e) => onFormChange("campaignDurationDays", Number(e.target.value))}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {SCHEDULE_WINDOW_PRESETS.map((preset) => {
                  const selected = form.campaignDurationDays === preset.days;
                  return (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => onFormChange("campaignDurationDays", preset.days)}
                      style={{
                        ...secondaryButtonStyle(false),
                        padding: "6px 10px",
                        fontSize: 13,
                        background: selected ? "#1e293b" : "#fff",
                        color: selected ? "#fff" : "#334155",
                        borderColor: selected ? "#1e293b" : "#cbd5e1",
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </label>
            <label>
              <HintLabel label="Treatment intensity" hint={CAMPAIGN_SETTING_HINTS.treatmentIntensity} />
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

          <label>
            <HintLabel
              label="Display / schedule timezone"
              hint="Upcoming and completed session times are shown in this timezone. Scheduling also uses this zone for day windows."
            />
            <select
              style={inputStyle}
              value={form.scheduleTimezone}
              onChange={(e) => onFormChange("scheduleTimezone", e.target.value)}
            >
              {AU_TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <label>
              <HintLabel label="Desktop mix %" hint={CAMPAIGN_SETTING_HINTS.desktopPercent} />
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
              <HintLabel label="CTR source" hint={CAMPAIGN_SETTING_HINTS.ctrSource} />
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
              <HintLabel label="Max share of demand" hint={CAMPAIGN_SETTING_HINTS.maxShareOfSearchDemand} />
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
              <HintLabel label="Rank-adaptive pacing" hint={CAMPAIGN_SETTING_HINTS.adaptivePacing} inline />
            </label>
            <label>
              <HintLabel
                label="Recalculate every (days)"
                hint={CAMPAIGN_SETTING_HINTS.recalculateEveryDays}
              />
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
              <HintLabel
                label="Max share of GSC impressions"
                hint={CAMPAIGN_SETTING_HINTS.maxShareOfGscImpressions}
              />
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
            Campaign is running. You can still change the schedule window and save to rebuild the
            upcoming queue; stop the campaign to edit other settings.
          </p>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          {!running && (
            <button type="button" onClick={onBack} disabled={Boolean(busy)} style={secondaryButtonStyle(Boolean(busy))}>
              Back
            </button>
          )}
          {!running && (
            <button type="button" onClick={onReanalyze} disabled={Boolean(busy)} style={secondaryButtonStyle(Boolean(busy))}>
              {busy === "analyze"
                ? "Analyzing..."
                : isGmb
                  ? "Re-analyze plan"
                  : "Re-analyze GSC"}
            </button>
          )}
          {!running && (
            <button type="button" onClick={onPreflight} disabled={Boolean(busy)} style={secondaryButtonStyle(Boolean(busy))}>
              {busy === "preflight"
                ? isGmb
                  ? "Checking Places..."
                  : "Checking Google..."
                : isGmb
                  ? "Validate Places ranking"
                  : "Validate on Google"}
            </button>
          )}
          {!running && (
            <button type="button" onClick={onPreview} disabled={Boolean(busy)} style={secondaryButtonStyle(Boolean(busy))}>
              {busy === "preview" ? "Calculating..." : "Update preview"}
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={Boolean(busy) || !form.keyword || !form.targetUrl}
            style={secondaryButtonStyle(Boolean(busy) || !form.keyword || !form.targetUrl)}
          >
            {busy === "save"
              ? "Saving..."
              : running
                ? "Save & reschedule"
                : "Save campaign"}
          </button>
          {!running ? (
            <button
              type="button"
              onClick={onSaveAndStart}
              disabled={startDisabled}
              style={primaryButtonStyle("#16a34a", startDisabled)}
            >
              {busy === "run" ? "Starting..." : "Save & start campaign"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              disabled={Boolean(busy)}
              style={primaryButtonStyle("#dc2626", Boolean(busy))}
            >
              {busy === "stop" ? "Stopping..." : "Stop campaign"}
            </button>
          )}
        </div>
        {!running && startBlockReason && (
          <p style={{ color: "#b45309", fontSize: 14, marginTop: 12 }}>{startBlockReason}</p>
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
                <strong>
                  Need {intensity.identityDeficit} more
                  {form.campaignKind === "gmb" && form.focusCity
                    ? ` ${form.focusCity}`
                    : ""}{" "}
                  identities
                </strong>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
                  {form.campaignKind === "gmb" && form.focusCity ? (
                    <>
                      You have {intensity.activeIdentityCount} eligible in {form.focusCity} but this
                      plan needs about {intensity.suggestedIdentities}. New identities will be
                      created with {form.focusCity} proxies.
                    </>
                  ) : (
                    <>
                      You have {intensity.activeIdentityCount} active but organic traffic needs about{" "}
                      {intensity.suggestedIdentities} mostly-unique visitors (max 2 sessions each).
                      The pool can still schedule {intensity.feasibleSessions} of{" "}
                      {intensity.totalAllocatedSessions} sessions with identity reuse.
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onCreateIdentities}
                disabled={Boolean(busy) || running}
                style={primaryButtonStyle("#2563eb", Boolean(busy) || running)}
              >
                {busy === "identities"
                  ? "Creating..."
                  : form.campaignKind === "gmb" && form.focusCity
                    ? `Create ${intensity.identityDeficit} ${form.focusCity} identities`
                    : `Create ${intensity.identityDeficit} identities`}
              </button>
            </div>
          )}
        </section>
      )}

      {form.queries.length > 0 && (
        <section style={{ ...panelStyle, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 16px" }}>Query cluster</h2>
          <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 12px" }}>
            {isGmb
              ? "GMB Place Ranking is from live local pack / More places validation. There is no GSC for Places — leave plan position blank until validated. Disable rows you do not want scheduled."
              : "GSC columns stay from analyze. Google column shows live preflight only. Disable rows you do not want scheduled."}
          </p>
          {notFoundQueries.length > 0 && (
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 12px" }}>
              {isGmb
                ? `Not found in local pack / More places: ${notFoundQueries.join(", ")}`
                : `Not found live on Google (3 pages): ${notFoundQueries.join(", ")}`}
            </p>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {(isGmb
                    ? [
                        "Use",
                        "Query",
                        "Type",
                        "GMB Place Ranking",
                        "Volume/mo",
                        "Plan position",
                        "Sessions",
                      ]
                    : [
                        "Use",
                        "Query",
                        "Type",
                        "Google live",
                        "Volume/mo",
                        "GSC position",
                        "GSC impr.",
                        "GSC clicks",
                        "Sessions",
                      ]
                  ).map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.queries.map((row, index) => {
                  const googleLabel =
                    row.preflightFound && row.preflightPosition != null
                      ? isGmb
                        ? `#${row.preflightPosition}`
                        : row.preflightSerpPage != null
                          ? `p${row.preflightSerpPage} #${row.preflightPosition}`
                          : `#${row.preflightPosition}`
                      : row.preflightStatus
                        ? "Not found"
                        : "—";
                  const rowStyle = row.active ? undefined : { opacity: 0.55 };
                  return (
                    <tr key={row.text} style={rowStyle}>
                      <td style={cellStyle}>
                        <input
                          type="checkbox"
                          checked={row.active}
                          onChange={(e) => onToggleQueryActive(index, e.target.checked)}
                          disabled={running}
                          aria-label={`Include ${row.text}`}
                        />
                      </td>
                      <td style={cellStyle}>{row.text}</td>
                      <td style={cellStyle}>{row.type}</td>
                      <td style={cellStyle}>{googleLabel}</td>
                      <td style={cellStyle}>
                        <input
                          style={{ ...inputStyle, padding: "6px 8px", width: 90 }}
                          type="number"
                          value={row.monthlySearchVolume ?? ""}
                          onChange={(e) => onQueryChange(index, "monthlySearchVolume", e.target.value)}
                          disabled={running || !row.active}
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
                          disabled={running || !row.active}
                          placeholder="—"
                        />
                      </td>
                      {!isGmb && (
                        <>
                          <td style={cellStyle}>{row.gscImpressions28d ?? "—"}</td>
                          <td style={cellStyle}>{row.gscClicks28d ?? "—"}</td>
                        </>
                      )}
                      <td style={cellStyle}>{row.active ? (row.allocatedSessions ?? "—") : "—"}</td>
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
