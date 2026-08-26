"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import Shell, { Card, Table } from "../components/Shell";

interface IdentityRow {
  id: string;
  externalId: string;
  region: string;
  city: string;
  deviceClass: string;
  active: boolean;
  totalSessions: number;
  blockedSessions: number;
  lastUsedAt: string | null;
}

export default function IdentitiesPage() {
  const [identities, setIdentities] = useState<IdentityRow[]>([]);

  async function load() {
    setIdentities(await apiGet<IdentityRow[]>("/identities"));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(id: string, enable: boolean) {
    await apiPost(`/identities/${id}/${enable ? "enable" : "disable"}`);
    await load();
  }

  return (
    <Shell title="Identities">
      <Card>
        <Table
          headers={[
            "ID",
            "Region",
            "City",
            "Device",
            "Active",
            "Sessions",
            "Blocked",
            "Last used",
            "Action",
          ]}
          rows={identities.map((identity) => [
            identity.externalId,
            identity.region,
            identity.city,
            identity.deviceClass,
            String(identity.active),
            String(identity.totalSessions),
            String(identity.blockedSessions),
            identity.lastUsedAt ? new Date(identity.lastUsedAt).toLocaleString() : "-",
            identity.active ? "disable" : "enable",
          ])}
        />
        <div style={{ marginTop: 12 }}>
          {identities.slice(0, 20).map((identity) => (
            <button
              key={identity.id}
              style={{ marginRight: 8 }}
              onClick={() => toggle(identity.id, !identity.active)}
            >
              {identity.active ? "Disable" : "Enable"} {identity.externalId}
            </button>
          ))}
        </div>
      </Card>
    </Shell>
  );
}
