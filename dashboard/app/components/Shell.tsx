import Link from "next/link";

const nav = [
  { href: "/", label: "Experiments" },
  { href: "/sessions", label: "Sessions" },
  { href: "/identities", label: "Identities" },
  { href: "/admin", label: "Admin" },
  { href: "/reports", label: "Reports" },
  { href: "/gsc", label: "GSC" },
];

export default function Shell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div>
      <header
        style={{
          background: "#0f172a",
          color: "white",
          padding: "16px 24px",
          display: "flex",
          gap: 24,
          alignItems: "center",
        }}
      >
        <strong>AU SERP Experiment Platform</strong>
        {nav.map((item) => (
          <Link key={item.href} href={item.href} style={{ color: "#cbd5e1" }}>
            {item.label}
          </Link>
        ))}
      </header>
      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 8,
        padding: 16,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

export function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {headers.map((header) => (
            <th
              key={header}
              style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 8 }}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} style={{ borderBottom: "1px solid #f1f5f9", padding: 8 }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
