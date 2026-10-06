import Link from "next/link";
import RankChange from "./RankChange";
import { rankSourceLabel, type RankPoint } from "./campaign-list-types";

interface Props {
  href: string;
  points: RankPoint[];
}

/** Rank change between checks; not found counts as worse than any rank, so no number. */
function changeSince(latest: RankPoint, previous: RankPoint | undefined): number | null {
  if (!previous || latest.position === null || previous.position === null) return null;
  return previous.position - latest.position;
}

function detail(point: RankPoint): string {
  if (point.source === "national" && point.totalCities) {
    return `National avg · found in ${point.foundCities ?? 0}/${point.totalCities} cities`;
  }
  return rankSourceLabel(point.source);
}

/** URL campaigns: latest rank and the move since the previous check; click for graph and history. */
export default function UrlRankCell({ href, points }: Props) {
  const latest = points[points.length - 1];
  if (!latest) {
    return (
      <Link href={href} style={{ color: "var(--muted)", fontSize: 11, textDecoration: "none" }}>
        No rank checks yet
      </Link>
    );
  }
  const previous = points[points.length - 2];
  const droppedOut = latest.position === null && previous?.position != null;
  return (
    <Link href={`${href}#rank-history`} title="Open graph and history" style={{ display: "flex", flexDirection: "column", gap: 2, color: "inherit", textDecoration: "none" }}>
      <strong style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.5 }}>
        {latest.position === null ? "Not found" : `#${latest.position}`}
      </strong>
      {droppedOut ? (
        <small style={{ fontSize: 11, color: "#bf4352" }}>▼ dropped out (was #{previous?.position})</small>
      ) : (
        <RankChange change={changeSince(latest, previous)} suffix="since last check" />
      )}
      <small style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>
        {detail(latest)} · {latest.localDate}
      </small>
    </Link>
  );
}
