"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearStoredPassword } from "../../lib/auth";
import { apiGet } from "../../lib/api";

const nav = [
  { href: "/", label: "Campaign" },
  { href: "/sessions", label: "Sessions" },
  { href: "/identities", label: "Identities" },
];

export default function AppLayout({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void apiGet<{ running: boolean }>("/campaign")
      .then((result) => setRunning(result.running))
      .catch(() => setRunning(false));
  }, [pathname]);

  function logout() {
    clearStoredPassword();
    router.replace("/login");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      <header
        style={{
          background: "#0f172a",
          color: "white",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <strong style={{ fontSize: 18 }}>CTR</strong>
          <nav style={{ display: "flex", gap: 16 }}>
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    color: active ? "white" : "#94a3b8",
                    fontWeight: active ? 600 : 400,
                    textDecoration: "none",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 13,
              background: running ? "#16a34a" : "#64748b",
            }}
          >
            {running ? "Running" : "Stopped"}
          </span>
          <button
            type="button"
            onClick={logout}
            style={{
              background: "transparent",
              border: "1px solid #475569",
              color: "#e2e8f0",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        {title && <h1 style={{ marginTop: 0 }}>{title}</h1>}
        {children}
      </main>
    </div>
  );
}
