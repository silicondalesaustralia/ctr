"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet } from "../../../lib/api";
import Shell, { Card } from "../../components/Shell";

interface SessionDetail {
  id: string;
  status: string;
  queryText: string;
  events: Array<{ timestamp: string; eventType: string; metadataJson: string | null }>;
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [session, setSession] = useState<SessionDetail | null>(null);

  useEffect(() => {
    apiGet<SessionDetail>(`/sessions/${sessionId}`).then(setSession);
  }, [sessionId]);

  return (
    <Shell title="Session detail">
      {!session ? (
        <Card>Loading...</Card>
      ) : (
        <>
          <Card>
            <p>Status: {session.status}</p>
            <p>Query: {session.queryText}</p>
          </Card>
          <Card>
            <h3>Event timeline</h3>
            <ul>
              {session.events.map((event) => (
                <li key={`${event.timestamp}-${event.eventType}`}>
                  {new Date(event.timestamp).toLocaleString()} — {event.eventType}
                  {event.metadataJson ? ` (${event.metadataJson})` : ""}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </Shell>
  );
}
