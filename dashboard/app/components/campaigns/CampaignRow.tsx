import Link from "next/link";
import RankSparkline from "../RankSparkline";
import CampaignRowMenu from "./CampaignRowMenu";
import {
  campaignInitials,
  campaignTitle,
  formatUpdated,
  regionParts,
  type CampaignAction,
  type CampaignSummary,
} from "./campaign-list-types";
import styles from "./CampaignTable.module.css";

interface Props {
  campaign: CampaignSummary;
  busyAction: CampaignAction | null;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string, label: string) => void;
}

const busyLabels: Record<CampaignAction, string> = {
  start: "Starting…",
  stop: "Stopping…",
  delete: "Deleting…",
};

function badgeClass(status: string): string {
  if (status === "active") return styles.badgeActive;
  if (status === "paused") return styles.badgePaused;
  return styles.badge;
}

export default function CampaignRow({ campaign, busyAction, onStart, onStop, onDelete }: Props) {
  const title = campaignTitle(campaign);
  const region = regionParts(campaign);
  const isGmb = campaign.campaignKind === "gmb";
  const href = `/campaign/${campaign.id}`;
  const label = campaign.keyword || title;

  return (
    <tr>
      <td>
        <div className={styles.campaign}>
          <div className={styles.monogram} aria-hidden="true">
            {campaignInitials(title)}
          </div>
          <div>
            <Link href={href} className={styles.title} title={isGmb ? title : campaign.targetUrl}>
              {title}
            </Link>
            <span className={styles.sub} title={campaign.keyword}>
              <span className={styles.kind}>{isGmb ? "GMB" : "URL"}</span>
              {campaign.keyword || "No keyword"}
            </span>
          </div>
        </div>
      </td>
      <td className={styles.location}>
        {region.primary}
        <small>{region.secondary}</small>
      </td>
      <td>
        <span className={badgeClass(campaign.status)}>
          <span className={styles.dot} />
          {campaign.status}
        </span>
      </td>
      <td className={styles.number}>{campaign.monthlySessionTarget}</td>
      <td className={styles.number}>{campaign.completedSessions}</td>
      <td className={styles.number}>
        <span className={styles.queued}>{campaign.scheduledSessions}</span>
      </td>
      <td>
        <RankSparkline ranks={campaign.rankHistory ?? []} />
      </td>
      <td className={styles.date}>{formatUpdated(campaign.updatedAt)}</td>
      <td>
        <div className={styles.actions}>
          <Link href={href} className={styles.open}>
            Open <span aria-hidden="true">↗</span>
          </Link>
          {busyAction ? (
            <span className={styles.date} role="status">
              {busyLabels[busyAction]}
            </span>
          ) : (
            <CampaignRowMenu
              label={label}
              isActive={campaign.status === "active"}
              onStart={() => onStart(campaign.id)}
              onStop={() => onStop(campaign.id)}
              onDelete={() => onDelete(campaign.id, label)}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
