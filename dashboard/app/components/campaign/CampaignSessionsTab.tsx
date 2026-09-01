"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionRows, schedule] = await Promise.all([
        apiGet<SessionRow[]>(`/sessions?experimentId=${campaignId}`),
        apiGet<{
          upcoming: ScheduleRow[];
          upcomingCount: number;
          note?: string;
        }>(`/campaigns/${campaignId}/schedule`),
      ]);
      setSessions(sessionRows);
      setUpcoming(schedule.upcoming);
      setScheduleNote(schedule.note ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <UpcomingScheduleSection
        upcoming={upcoming}
        scheduleNote={scheduleNote}
        loading={loading}
        error={error}
        onRefresh={() => void load()}
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
