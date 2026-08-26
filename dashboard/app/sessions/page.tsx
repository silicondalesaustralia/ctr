import Link from "next/link";
import { safeApiGet } from "../../lib/api";
import Shell, { Card, Table } from "../components/Shell";

interface SessionRow {
  id: string;
  createdAt: string;
  queryText: string;
  status: string;
  observedPosition: number | null;
  targetClicked: boolean | null;
  durationSeconds: number;
  scrollDepth: number;
  internalClicks: number;
  identity: { externalId: string; region: string; deviceClass: string };
}

export default async function SessionsPage() {
  const { data: sessions, error } = await safeApiGet<SessionRow[]>("/sessions");

  return (
    <Shell title="Sessions">
      {error && (
        <Card>
          <p style={{ color: "#b91c1c" }}>
            <strong>Could not load sessions.</strong> {error}
          </p>
        </Card>
      )}
      <Card>
        <Table
          headers={[
            "Time",
            "Identity",
            "Region",
            "Device",
            "Query",
            "Position",
            "Clicked",
            "Duration",
            "Scroll",
            "Internal",
            "Status",
          ]}
          rows={(sessions ?? []).map((s) => [
            new Date(s.createdAt).toLocaleString(),
            s.identity.externalId,
            s.identity.region,
            s.identity.deviceClass,
            s.queryText,
            s.observedPosition?.toString() ?? "-",
            String(s.targetClicked ?? false),
            `${s.durationSeconds}s`,
            `${s.scrollDepth.toFixed(0)}%`,
            String(s.internalClicks),
            s.status,
          ])}
        />
      </Card>
      <Card>
        <ul>
          {(sessions ?? []).slice(0, 10).map((s) => (
            <li key={s.id}>
              <Link href={`/sessions/${s.id}`}>{s.id}</Link>
            </li>
          ))}
        </ul>
      </Card>
    </Shell>
  );
}
