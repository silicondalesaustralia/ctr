import CampaignRow from "./CampaignRow";
import type { CampaignAction, CampaignSummary } from "./campaign-list-types";
import styles from "./CampaignTable.module.css";

interface Props {
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
  "Rank check",
];

export default function CampaignTable({ campaigns, busy, onStart, onStop, onDelete, onUpdateRank }: Props) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((header) => (
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
