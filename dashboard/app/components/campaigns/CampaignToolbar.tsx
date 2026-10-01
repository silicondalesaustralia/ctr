import type { StatusFilter } from "./campaign-list-types";
import styles from "./CampaignList.module.css";

interface Props {
  status: StatusFilter;
  counts: Record<StatusFilter, number>;
  onStatusChange: (status: StatusFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  region: string;
  regions: string[];
  onRegionChange: (value: string) => void;
}

const tabs: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All campaigns" },
  { id: "active", label: "Active" },
  { id: "stopped", label: "Stopped" },
  { id: "draft", label: "Draft" },
];

export default function CampaignToolbar(props: Props) {
  const visibleTabs = tabs.filter((tab) => tab.id !== "draft" || props.counts.draft > 0);

  return (
    <div className={styles.toolbar}>
      <div className={styles.tabs} role="group" aria-label="Filter by status">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={props.status === tab.id ? styles.tabSelected : styles.tab}
            aria-pressed={props.status === tab.id}
            onClick={() => props.onStatusChange(tab.id)}
          >
            {tab.label}
            <span className={styles.tabCount}>{props.counts[tab.id]}</span>
          </button>
        ))}
      </div>
      <div className={styles.filters}>
        <label className={styles.search}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="6" />
            <path d="m15 15 5 5" />
          </svg>
          <input
            className={styles.input}
            aria-label="Search campaigns"
            placeholder="Search campaigns..."
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
        </label>
        <select
          className={styles.select}
          aria-label="Filter by region"
          value={props.region}
          onChange={(event) => props.onRegionChange(event.target.value)}
        >
          <option value="all">All regions</option>
          {props.regions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
