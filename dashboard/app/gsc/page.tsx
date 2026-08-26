"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import Shell, { Card } from "../components/Shell";

interface Experiment {
  id: string;
  slug: string;
}

export default function GscPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [experimentId, setExperimentId] = useState("");
  const [filePath, setFilePath] = useState("");
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    apiGet<Experiment[]>("/experiments").then((items) => {
      setExperiments(items);
      if (items[0]) setExperimentId(items[0].id);
    });
  }, []);

  async function importFile() {
    const response = await apiPost<{ imported: number }>("/gsc/import", {
      experimentId,
      filePath,
    });
    setResult(`Imported ${response.imported} rows`);
  }

  return (
    <Shell title="GSC import">
      <Card>
        <label>
          Experiment
          <select value={experimentId} onChange={(e) => setExperimentId(e.target.value)}>
            {experiments.map((exp) => (
              <option key={exp.id} value={exp.id}>
                {exp.slug}
              </option>
            ))}
          </select>
        </label>
        <div style={{ marginTop: 12 }}>
          <input
            style={{ width: "100%" }}
            placeholder="Absolute path to GSC CSV file"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
          />
        </div>
        <button style={{ marginTop: 12 }} onClick={importFile}>
          Import GSC data
        </button>
        {result && <p>{result}</p>}
      </Card>
    </Shell>
  );
}
