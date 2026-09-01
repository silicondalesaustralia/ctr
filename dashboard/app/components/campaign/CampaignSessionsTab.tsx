"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../../../lib/api";
import CompletedSessionsSection, {
  type SessionRow,
} from "./CompletedSessionsSection";
import UpcomingScheduleSection, {
  type ScheduleRow,
} from "./UpcomingScheduleSection";
import type { CampaignKind } from "./shared";

interface Props {
  campaignId: string;
  campaignKind?: CampaignKind;
}

export default function CampaignSessionsTab({
  campaignId,
  campaignKind = "url",
}: Props) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [upcoming, setUpcoming] = useState<ScheduleRow[]>([]);
  const [scheduleNote, setScheduleNote] = useState<string | null>(null);
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionRows, schedule] = await Promise.all([
        apiGet<SessionRow[]>(`/sessions?experimentId=${campaignId}`),
        apiGet<{
          upcoming: ScheduleRow[];
          upcomingCount: number;
          note?: string;
          campaignStatus?: string;
        }>(`/campaigns/${campaignId}/schedule`),
      ]);
      setSessions(sessionRows);
      setUpcoming(schedule.upcoming);
      setScheduleNote(schedule.note ?? null);
      setCampaignStatus(schedule.campaignStatus ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const rebuild = useCallback(async () => {
    setRebuilding(true);
    try {
      await apiPost(`/campaigns/${campaignId}/schedule/rebuild`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rebuild schedule");
    } finally {
      setRebuilding(false);
    }
  }, [campaignId, load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <UpcomingScheduleSection
        upcoming={upcoming}
        scheduleNote={scheduleNote}
        campaignStatus={campaignStatus}
        loading={loading}
        rebuilding={rebuilding}
        error={error}
        onRefresh={() => void load()}
        onRebuild={() => void rebuild()}
      />
      <CompletedSessionsSection
        campaignId={campaignId}
        campaignKind={campaignKind}
        sessions={sessions}
        loading={loading}
      />
    </div>
  );
}
