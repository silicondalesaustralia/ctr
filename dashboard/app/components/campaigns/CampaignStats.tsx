import type { CampaignSummary } from "./campaign-list-types";
import styles from "./CampaignStats.module.css";

interface Props {
  campaigns: CampaignSummary[];
  activeCount: number;
}

function sum(campaigns: CampaignSummary[], pick: (campaign: CampaignSummary) => number): number {
  return campaigns.reduce((total, campaign) => total + pick(campaign), 0);
}

export default function CampaignStats({ campaigns, activeCount }: Props) {
  const total = campaigns.length;
  const allRunning = total > 0 && activeCount === total;
  const cards = [
    {
      label: "Active campaigns",
      icon: "◉",
      value: activeCount,
      foot: allRunning ? "All campaigns running" : `${activeCount} of ${total} running`,
      green: activeCount > 0,
    },
    {
      label: "Planned sessions",
      icon: "▤",
      value: sum(campaigns, (c) => c.monthlySessionTarget),
      foot: `Across ${total} campaign${total === 1 ? "" : "s"}`,
    },
    {
      label: "Completed sessions",
      icon: "✓",
      value: sum(campaigns, (c) => c.completedSessions),
      foot: "Total shown across campaigns",
    },
    {
      label: "Queued sessions",
      icon: "◷",
      value: sum(campaigns, (c) => c.scheduledSessions),
      foot: "In the shared worker queue",
    },
  ];

  return (
    <section className={styles.stats} aria-label="Campaign totals">
      {cards.map((card) => (
        <div key={card.label} className={styles.stat}>
          <div className={styles.statHead}>
            {card.label}
            <span className={styles.statIcon} aria-hidden="true">
              {card.icon}
            </span>
          </div>
          <div className={styles.statValue}>{card.value}</div>
          <div className={card.green ? `${styles.statFoot} ${styles.green}` : styles.statFoot}>
            {card.green && <span className={styles.dot} />}
            {card.foot}
          </div>
        </div>
      ))}
    </section>
  );
}
