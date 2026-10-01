import type { CampaignTab } from "./shared";

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
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        marginBottom: 24,
        borderRadius: 9,
        background: "#eef0f4",
        flexWrap: "wrap",
      }}
    >
      {visible.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            style={{
              border: 0,
              borderRadius: 7,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 550,
              cursor: "pointer",
              background: selected ? "var(--surface)" : "transparent",
              color: selected ? "var(--text)" : "var(--muted)",
              boxShadow: selected ? "0 1px 4px #20253512" : "none",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
