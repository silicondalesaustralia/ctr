import Link from "next/link";
import { apiGet } from "../lib/api";
import Shell, { Card, Table } from "./components/Shell";

interface Experiment {
  id: string;
  name: string;
  slug: string;
  status: string;
  targetUrl: string;
  monthlySessionTarget: number;
  _count: { sessions: number; scheduledSessions: number };
}

export default async function ExperimentsPage() {
  const experiments = await apiGet<Experiment[]>("/experiments");

  return (
    <Shell title="Experiments">
      <Card>
        <Table
          headers={["Name", "Status", "Target", "Sessions", "Scheduled", "Actions"]}
          rows={experiments.map((exp) => [
            exp.name,
            exp.status,
            exp.targetUrl,
            String(exp._count.sessions),
            String(exp._count.scheduledSessions),
            "view",
          ])}
        />
      </Card>
      <Card>
        <h3>Quick links</h3>
        <ul>
          {experiments.map((exp) => (
            <li key={exp.id}>
              <Link href={`/experiments/${exp.id}`}>{exp.slug}</Link>
            </li>
          ))}
        </ul>
      </Card>
    </Shell>
  );
}
