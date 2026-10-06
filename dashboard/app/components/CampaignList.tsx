"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AppLayout from "./AppLayout";
import CampaignStats from "./campaigns/CampaignStats";
import CampaignTable from "./campaigns/CampaignTable";
import CampaignToolbar from "./campaigns/CampaignToolbar";
import { matchesStatus, regionParts, type StatusFilter } from "./campaigns/campaign-list-types";
import { useCampaigns } from "./campaigns/useCampaigns";
import styles from "./campaigns/CampaignPanel.module.css";

const statuses: StatusFilter[] = ["all", "active", "stopped", "draft"];

export default function CampaignList() {
  const data = useCampaigns();
  const { campaigns } = data;
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");

  const counts = useMemo(
    () =>
      Object.fromEntries(
        statuses.map((s) => [s, campaigns.filter((c) => matchesStatus(c.status, s)).length]),
      ) as Record<StatusFilter, number>,
    [campaigns],
  );
  const regions = useMemo(
    () => [...new Set(campaigns.map((c) => regionParts(c).primary))].sort(),
    [campaigns],
  );
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      const haystack = [c.name, c.keyword, c.targetUrl, c.gmbBusinessName ?? ""].join(" ").toLowerCase();
      return (
        matchesStatus(c.status, status) &&
        haystack.includes(query) &&
        (region === "all" || regionParts(c).primary === region)
      );
    });
  }, [campaigns, status, search, region]);

  const newButton = (
    <Link href="/campaign/new" className={styles.newCampaign}>
      <span aria-hidden="true" className={styles.plus}>+</span>
      New campaign
    </Link>
  );

  return (
    <AppLayout
      eyebrow="Overview"
      title="Campaigns"
      subtitle="A clear view of every campaign, all in one place."
      actions={newButton}
    >
      <CampaignStats campaigns={campaigns} activeCount={data.activeCount} />

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.sectionTitle}>
            Your campaigns <span className={styles.count}>{campaigns.length}</span>
          </div>
          <div className={styles.headActions}>
            {data.lastLoaded && (
              <span className={styles.small}>
                Last updated {data.lastLoaded.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            <button
              type="button"
              className={styles.updateAll}
              onClick={() => void data.updateAllRanks()}
              disabled={data.updatingAll || data.activeCount === 0}
              title="Run a rank check now for every active campaign, outside of sessions"
            >
              {data.updatingAll ? "Queuing…" : "Update all positions"}
            </button>
          </div>
        </div>
        <CampaignToolbar
          status={status}
          counts={counts}
          onStatusChange={setStatus}
          search={search}
          onSearchChange={setSearch}
          region={region}
          regions={regions}
          onRegionChange={setRegion}
        />
        {data.error && <p className={styles.error} role="alert">{data.error}</p>}

        {data.loading ? (
          <p className={styles.message}>Loading campaigns…</p>
        ) : campaigns.length === 0 ? (
          <p className={styles.message}>
            No campaigns yet. Create one to analyze keywords, run Google preflight, and schedule sessions.
          </p>
        ) : visible.length === 0 ? (
          <p className={styles.message}>No campaigns match these filters.</p>
        ) : (
          <CampaignTable
            campaigns={visible}
            busy={data.busy}
            onStart={data.startCampaign}
            onStop={data.stopCampaign}
            onDelete={data.deleteCampaign}
            onUpdateRank={data.updateRank}
          />
        )}

        <div className={styles.panelFoot}>
          <span>
            Showing {visible.length} of {campaigns.length} campaigns
          </span>
          <span>Latest rank check from the campaign centre · lower is better</span>
        </div>
      </section>

      <div className={styles.note}>
        <span aria-hidden="true" className={styles.noteIcon}>i</span>
        <span>Campaigns run in parallel and share the same identity pool and worker queue.</span>
      </div>
    </AppLayout>
  );
}
