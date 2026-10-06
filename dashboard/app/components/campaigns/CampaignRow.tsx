import Link from "next/link";
import RankSparkline from "../RankSparkline";
import CampaignProgressCell from "./CampaignProgressCell";
import CampaignRowMenu from "./CampaignRowMenu";
import { campaignProgress, formatNextSession } from "./campaign-progress";
import progressStyles from "./CampaignProgress.module.css";
import {
  campaignInitials,
  campaignTitle,
  coverageLine,
  formatUpdated,
  regionParts,
  type CampaignAction,
  type CampaignSummary,
} from "./campaign-list-types";
import cells from "./CampaignCells.module.css";
import styles from "./CampaignRow.module.css";

interface Props {
  campaign: CampaignSummary;
  busyAction: CampaignAction | null;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string, label: string) => void;
  onUpdateRank: (id: string) => void;
}

const busyLabels: Record<CampaignAction, string> = {
  start: "Starting…",
  stop: "Stopping…",
  delete: "Deleting…",
  rank: "Queuing…",
};

function badgeClass(status: string): string {
  if (status === "active") return cells.badgeActive;
  if (status === "paused") return cells.badgePaused;
  return cells.badge;
}

export default function CampaignRow({ campaign, busyAction, onStart, onStop, onDelete, onUpdateRank }: Props) {
  const title = campaignTitle(campaign);
  const region = regionParts(campaign);
  const isGmb = campaign.campaignKind === "gmb";
  const href = `/campaign/${campaign.id}`;
  const label = campaign.keyword || title;
  const progress = campaignProgress(campaign);
  const next = formatNextSession(campaign.nextSessionAt);

  return (
    <tr>
      <td>
        <div className={styles.campaign}>
          <div className={styles.monogram} aria-hidden="true">
            {campaignInitials(title)}
          </div>
          <div className={styles.text}>
            <Link href={href} className={styles.title} title={isGmb ? title : campaign.targetUrl}>
              {title}
            </Link>
            <span className={styles.sub} title={campaign.keyword}>
              <span className={styles.kind}>{isGmb ? "GMB" : "URL"}</span>
              <span className={styles.keyword}>{campaign.keyword || "No keyword"}</span>
            </span>
          </div>
        </div>
      </td>
      <td className={cells.location}>
        {region.primary}
        <small>{region.secondary}</small>
      </td>
      <td>
        <span className={badgeClass(campaign.status)}>
          <span className={cells.dot} />
          {campaign.status}
        </span>
        <small className={cells.updated}>Updated {formatUpdated(campaign.updatedAt)}</small>
      </td>
      <td className={cells.number}>{campaign.monthlySessionTarget}</td>
      <td className={cells.number}>{campaign.completedSessions}</td>
      <td className={cells.number}>
        <span className={cells.queued}>{campaign.scheduledSessions}</span>
      </td>
      <td className={progressStyles.next}>
        {next ? next.when : "—"}
        <small>{next ? next.hint : "Nothing queued"}</small>
      </td>
      <td className={progressStyles.days}>
        {progress.day > 0 ? `Day ${progress.day} of ${progress.totalDays}` : `${progress.totalDays} days`}
        <small>{progress.day > 0 ? `${progress.totalDays}-day campaign` : "Not started"}</small>
      </td>
      <td>
        <CampaignProgressCell progress={progress} />
      </td>
      <td>
        <RankSparkline points={campaign.rankHistory ?? []} />
        {coverageLine(campaign) && <small className={cells.updated}>{coverageLine(campaign)}</small>}
        {campaign.rankCheckQueued && (
          <small className={cells.updated} role="status">
            Checking position…
          </small>
        )}
      </td>
      <td>
        <div className={cells.actions}>
          <Link href={href} className={cells.open}>
            Open <span aria-hidden="true">↗</span>
          </Link>
          {busyAction ? (
            <span className={cells.date} role="status">
              {busyLabels[busyAction]}
            </span>
          ) : (
            <CampaignRowMenu
              label={label}
              isActive={campaign.status === "active"}
              onStart={() => onStart(campaign.id)}
              onStop={() => onStop(campaign.id)}
              onDelete={() => onDelete(campaign.id, label)}
              onUpdateRank={() => onUpdateRank(campaign.id)}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
