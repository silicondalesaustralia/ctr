import Link from "next/link";
import { safeApiGet } from "../lib/api";
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
  const { data: experiments, error } = await safeApiGet<Experiment[]>("/experiments");

  return (
    <Shell title="Experiments">
      {error && (
        <Card>
          <p style={{ color: "#b91c1c" }}>
            <strong>Could not load experiments.</strong> {error}
          </p>
          <p>
            Check Vercel env vars: <code>NEXT_PUBLIC_API_URL</code> and{" "}
            <code>NEXT_PUBLIC_API_KEY</code> must match Railway <code>ADMIN_API_KEY</code>.
          </p>
        </Card>
      )}
      <Card>
        <Table
          headers={["Name", "Status", "Target", "Sessions", "Scheduled", "Actions"]}
          rows={(experiments ?? []).map((exp) => [
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
          {(experiments ?? []).map((exp) => (
            <li key={exp.id}>
              <Link href={`/experiments/${exp.id}`}>{exp.slug}</Link>
            </li>
          ))}
        </ul>
      </Card>
    </Shell>
  );
}
