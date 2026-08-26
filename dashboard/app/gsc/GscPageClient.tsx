"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import { apiDelete, apiGet } from "../../lib/api";
import { panelStyle, primaryButtonStyle, secondaryButtonStyle } from "../components/campaign/shared";

interface GscConnection {
  id: string;
  label: string;
  googleEmail: string | null;
  createdAt: string;
}

interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export default function GscPageClient() {
  const [connections, setConnections] = useState<GscConnection[]>([]);
  const [sitesByConnection, setSitesByConnection] = useState<Record<string, GscSite[]>>({});
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    const [statusRes, connectionsRes] = await Promise.all([
      apiGet<{ oauthConfigured: boolean }>("/gsc/status"),
      apiGet<{ connections: GscConnection[] }>("/gsc/connections"),
    ]);
    setOauthConfigured(statusRes.oauthConfigured);
    setConnections(connectionsRes.connections);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadConnections();
        const params = new URLSearchParams(window.location.search);
        const urlError = params.get("error");
        const connected = params.get("connected");
        if (urlError) {
          setError(decodeURIComponent(urlError));
        } else if (connected) {
          setMessage("GSC account connected.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load GSC connections");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadConnections]);

  async function loadSites(connectionId: string) {
    if (sitesByConnection[connectionId]) return;
    setBusy(`sites-${connectionId}`);
    try {
      const result = await apiGet<{ sites: GscSite[] }>(`/gsc/connections/${connectionId}/sites`);
      setSitesByConnection((prev) => ({ ...prev, [connectionId]: result.sites }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load GSC properties");
    } finally {
      setBusy(null);
    }
  }

  async function connectAccount() {
    setBusy("connect");
    setError(null);
    try {
      const result = await apiGet<{ url: string }>("/gsc/oauth/start");
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start GSC OAuth");
      setBusy(null);
    }
  }

  async function removeConnection(connectionId: string) {
    setBusy(`delete-${connectionId}`);
    setError(null);
    try {
      await apiDelete(`/gsc/connections/${connectionId}`);
      setConnections((prev) => prev.filter((item) => item.id !== connectionId));
      setSitesByConnection((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
      setMessage("GSC account disconnected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect account");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <AppLayout title="GSC accounts">
        <p>Loading...</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="GSC accounts">
      <section style={panelStyle}>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          Connect separate Google Search Console accounts for each client. When setting up a campaign,
          pick the account and property (domain) to pull live query and ranking data from.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => void connectAccount()}
            disabled={Boolean(busy) || !oauthConfigured}
            style={primaryButtonStyle("#2563eb")}
          >
            {busy === "connect" ? "Redirecting..." : "Connect GSC account"}
          </button>
          <Link href="/" style={{ alignSelf: "center", color: "#2563eb" }}>
            Back to campaign
          </Link>
        </div>

        {!oauthConfigured && (
          <p style={{ color: "#b45309" }}>
            OAuth is not configured on the API yet. Set GSC_CLIENT_ID, GSC_CLIENT_SECRET, and
            GSC_OAUTH_REDIRECT_URI on Railway.
          </p>
        )}

        {connections.length === 0 ? (
          <p style={{ color: "#64748b" }}>No GSC accounts connected yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {connections.map((connection) => (
              <div
                key={connection.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: 16,
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong>{connection.label}</strong>
                    {connection.googleEmail && (
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
                        {connection.googleEmail}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void loadSites(connection.id)}
                      disabled={Boolean(busy)}
                      style={secondaryButtonStyle}
                    >
                      {busy === `sites-${connection.id}` ? "Loading..." : "Show properties"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeConnection(connection.id)}
                      disabled={Boolean(busy)}
                      style={secondaryButtonStyle}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>

                {sitesByConnection[connection.id] && (
                  <ul style={{ margin: "12px 0 0", paddingLeft: 20, color: "#334155" }}>
                    {sitesByConnection[connection.id].map((site) => (
                      <li key={site.siteUrl} style={{ marginBottom: 4 }}>
                        {site.siteUrl}
                        <span style={{ color: "#64748b", fontSize: 13 }}> ({site.permissionLevel})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {message && <p style={{ color: "#16a34a", marginTop: 16 }}>{message}</p>}
        {error && <p style={{ color: "#b91c1c", marginTop: 16 }}>{error}</p>}
      </section>
    </AppLayout>
  );
}
