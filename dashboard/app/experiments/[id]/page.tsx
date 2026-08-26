"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiGet, apiPost } from "../../../lib/api";
import Shell, { Card, Table } from "../../components/Shell";

interface ExperimentDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  targetUrl: string;
  queries: Array<{ query: string; weight: number; queryType: string }>;
  sessions: Array<{ id: string; status: string; queryText: string; createdAt: string }>;
}

export default function ExperimentDetailPage() {
  const params = useParams<{ id: string }>();
  const experimentId = params.id;
  const [experiment, setExperiment] = useState<ExperimentDetail | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [exp, ana] = await Promise.all([
        apiGet<ExperimentDetail>(`/experiments/${experimentId}`),
        apiGet<Record<string, unknown>>(`/experiments/${experimentId}/analysis`),
      ]);
      setExperiment(exp);
      setAnalysis(ana);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, [experimentId]);

  async function action(path: string) {
    await apiPost(`/experiments/${experimentId}/${path}`);
    await load();
  }

  if (error) return <Shell title="Experiment"><Card>{error}</Card></Shell>;
  if (!experiment) return <Shell title="Experiment"><Card>Loading...</Card></Shell>;

  return (
    <Shell title={experiment.name}>
      <Card>
        <p>Status: {experiment.status}</p>
        <p>Target: {experiment.targetUrl}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => action("pause")}>Pause</button>
          <button onClick={() => action("resume")}>Resume</button>
          <button onClick={() => action("cancel-future")}>Cancel future sessions</button>
          <Link href="/">Back</Link>
        </div>
      </Card>
      <Card>
        <h3>Queries</h3>
        <Table
          headers={["Query", "Type", "Weight"]}
          rows={experiment.queries.map((q) => [q.query, q.queryType, String(q.weight)])}
        />
      </Card>
      <Card>
        <h3>Recent sessions</h3>
        <Table
          headers={["Time", "Query", "Status", "View"]}
          rows={experiment.sessions.map((s) => [
            new Date(s.createdAt).toLocaleString(),
            s.queryText,
            s.status,
            "detail",
          ])}
        />
      </Card>
      {analysis && (
        <Card>
          <h3>Analysis</h3>
          <pre>{JSON.stringify(analysis, null, 2)}</pre>
        </Card>
      )}
    </Shell>
  );
}
