"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut } from "../../lib/api";
import Shell, { Card } from "../components/Shell";

export default function AdminPage() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    apiGet<{ enabled: boolean }>("/settings/runner").then((data) => setEnabled(data.enabled));
  }, []);

  async function toggleRunner() {
    const next = !enabled;
    await apiPut("/settings/runner", { enabled: next });
    setEnabled(next);
  }

  return (
    <Shell title="Admin controls">
      <Card>
        <h3>Global kill switch</h3>
        <p>Runner enabled: {enabled ? "Yes" : "No"}</p>
        <button onClick={toggleRunner}>{enabled ? "Disable runner" : "Enable runner"}</button>
      </Card>
      <Card>
        <h3>Environment reminder</h3>
        <p>
          You can also set <code>EXPERIMENT_RUNNER_ENABLED=false</code> in the environment to
          prevent workers from starting new sessions.
        </p>
      </Card>
    </Shell>
  );
}
