import CampaignRow from "./CampaignRow";
import type { CampaignAction, CampaignSummary } from "./campaign-list-types";
import styles from "./CampaignTable.module.css";

interface Props {
  title: string;
  /** Header for the rank column: grid coverage for GMB, latest rank for URL. */
  rankHeader: string;
  campaigns: CampaignSummary[];
  busy: { id: string; action: CampaignAction } | null;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string, label: string) => void;
  onUpdateRank: (id: string) => void;
}

const headers = [
  "Campaign",
  "Region",
  "Status",
  "Planned",
  "Done",
  "Queued",
  "Next session",
  "Days",
  "Progress",
];

export default function CampaignTable({ title, rankHeader, campaigns, busy, onStart, onStop, onDelete, onUpdateRank }: Props) {
  return (
    <div className={styles.wrap}>
      <h3 className={styles.groupTitle}>
        {title} <span className={styles.groupCount}>{campaigns.length}</span>
      </h3>
      <table className={styles.table}>
        <thead>
          <tr>
            {[...headers, rankHeader].map((header) => (
              <th key={header}>{header}</th>
            ))}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <CampaignRow
              key={campaign.id}
              campaign={campaign}
              busyAction={busy?.id === campaign.id ? busy.action : null}
              onStart={onStart}
              onStop={onStop}
              onDelete={onDelete}
              onUpdateRank={onUpdateRank}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
