import type { CampaignTab } from "./shared";
import { secondaryButtonBase } from "./shared";

interface Props {
  active: CampaignTab;
  onChange: (tab: CampaignTab) => void;
  showPlan: boolean;
}

const tabs: Array<{ id: CampaignTab; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "sessions", label: "Sessions" },
  { id: "identities", label: "Identities" },
];

export default function CampaignTabBar({ active, onChange, showPlan }: Props) {
  const visible = showPlan ? tabs : tabs.filter((tab) => tab.id !== "plan");

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
      {visible.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          style={{
            ...secondaryButtonBase,
            background: active === tab.id ? "#0f172a" : "white",
            color: active === tab.id ? "white" : "#0f172a",
            borderColor: active === tab.id ? "#0f172a" : "#cbd5e1",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
