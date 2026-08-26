"use client";

import { useEffect, useState } from "react";
import { apiExportUrl, apiGet, apiKey } from "../../lib/api";
import Shell, { Card } from "../components/Shell";

interface Experiment {
  id: string;
  slug: string;
  name: string;
}

export default function ReportsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [report, setReport] = useState<string>("");

  useEffect(() => {
    apiGet<Experiment[]>("/experiments").then(setExperiments);
  }, []);

  async function loadReport(id: string) {
    const response = await fetch(`${apiExportUrl(`/experiments/${id}/report`)}`, {
      headers: { "x-api-key": apiKey },
    });
    setReport(await response.text());
  }

  return (
    <Shell title="Reports">
      <Card>
        <h3>Generate report</h3>
        {experiments.map((exp) => (
          <button key={exp.id} style={{ marginRight: 8 }} onClick={() => loadReport(exp.id)}>
            Report: {exp.slug}
          </button>
        ))}
      </Card>
      <Card>
        <h3>Export sessions CSV</h3>
        {experiments.map((exp) => (
          <p key={exp.id}>
            <a
              href={`${apiExportUrl(`/sessions/export.csv?experimentId=${exp.id}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Export CSV for {exp.slug}
            </a>
          </p>
        ))}
      </Card>
      {report && (
        <Card>
          <h3>Report preview</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{report}</pre>
        </Card>
      )}
    </Shell>
  );
}
