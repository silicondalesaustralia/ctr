import type { CampaignProgress } from "./campaign-progress";
import styles from "./CampaignProgress.module.css";

interface Props {
  progress: CampaignProgress;
}

function Bar({ label, percent }: { label: string; percent: number | null }) {
  return (
    <div className={styles.line}>
      <span className={styles.label}>{label}</span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${Math.min(percent ?? 0, 100)}%` }} />
      </span>
      <span className={styles.value}>{percent === null ? "—" : `${percent}%`}</span>
    </div>
  );
}

export default function CampaignProgressCell({ progress }: Props) {
  return (
    <div
      className={styles.cell}
      aria-label={`Time ${progress.timePercent ?? 0}% elapsed, sessions ${progress.sessionPercent ?? 0}% completed`}
    >
      <Bar label="Time" percent={progress.timePercent} />
      <Bar label="Sessions" percent={progress.sessionPercent} />
    </div>
  );
}
