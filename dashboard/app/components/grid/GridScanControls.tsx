import { scanLabel, type GridMode, type GridScan } from "./grid-types";

interface GridScanControlsProps {
  queries: string[];
  query: string;
  onQuery: (query: string) => void;
  scans: GridScan[];
  fromId: string;
  toId: string;
  onFrom: (id: string) => void;
  onTo: (id: string) => void;
  mode: GridMode;
  onMode: (mode: GridMode) => void;
}

const MODES: { id: GridMode; label: string }[] = [
  { id: "before", label: "Before" },
  { id: "latest", label: "Latest" },
  { id: "change", label: "Change" },
];

const selectStyle = { padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)", font: "inherit" };
const labelStyle = { display: "grid", gap: 4, fontSize: 12, color: "#767d8e" };

/** Query, From/To scan pickers and the Before/Latest/Change toggle. */
export default function GridScanControls(props: GridScanControlsProps) {
  const { queries, query, onQuery, scans, fromId, toId, onFrom, onTo, mode, onMode } = props;
  const options = scans.map((scan) => (
    <option key={scan.id} value={scan.id}>
      {scanLabel(scan)}
    </option>
  ));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
      {queries.length > 1 && (
        <label style={labelStyle}>
          Keyword
          <select value={query} onChange={(event) => onQuery(event.target.value)} style={selectStyle}>
            {queries.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      )}
      <label style={labelStyle}>
        From
        <select value={fromId} onChange={(event) => onFrom(event.target.value)} style={selectStyle}>
          {options}
        </select>
      </label>
      <label style={labelStyle}>
        To
        <select value={toId} onChange={(event) => onTo(event.target.value)} style={selectStyle}>
          {options}
        </select>
      </label>
      <div role="group" aria-label="Map view" style={{ display: "flex", border: "1px solid var(--line)", borderRadius: 6 }}>
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onMode(item.id)}
            aria-pressed={mode === item.id}
            style={{
              padding: "6px 12px",
              border: "none",
              background: mode === item.id ? "var(--accent)" : "transparent",
              color: mode === item.id ? "#fff" : "inherit",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
