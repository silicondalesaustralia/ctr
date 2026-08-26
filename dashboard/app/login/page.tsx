"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredPassword, isAuthenticated, verifyLogin, verifyStoredPassword } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!isAuthenticated()) {
        return;
      }

      const valid = await verifyStoredPassword();
      if (valid) {
        router.replace("/");
      }
    })();
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      await verifyLogin(password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0f172a",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          borderRadius: 12,
          padding: 32,
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>CTR Campaign</h1>
        <p style={{ margin: "0 0 24px", color: "#64748b" }}>
          Sign in to manage search campaigns.
        </p>

        <label style={{ display: "block", marginBottom: 20 }}>
          <span style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            required
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              fontSize: 15,
              boxSizing: "border-box",
            }}
          />
        </label>

        {error && <p style={{ color: "#b91c1c", marginBottom: 16 }}>{error}</p>}
        {notice && <p style={{ color: "#16a34a", marginBottom: 16 }}>{notice}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 8,
            border: "none",
            background: "#0f172a",
            color: "white",
            fontSize: 15,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
