"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearStoredPassword } from "../../lib/auth";
import { apiGet } from "../../lib/api";
import styles from "./AppLayout.module.css";

const nav = [
  { href: "/", label: "Campaigns" },
  { href: "/identities", label: "Identities" },
  { href: "/gsc", label: "GSC" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/campaign");
  return pathname.startsWith(href);
}

export default function AppLayout({
  children,
  title,
  eyebrow,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    void apiGet<{ running: boolean; activeCount?: number }>("/campaign")
      .then((result) => {
        setRunning(result.running);
        setActiveCount(result.activeCount ?? 0);
      })
      .catch(() => {
        setRunning(false);
        setActiveCount(0);
      });
  }, [pathname]);

  function logout() {
    clearStoredPassword();
    router.replace("/login");
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.left}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandmark} aria-hidden="true">
              <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
                <path
                  d="M3 14V9M10 14V4M17 14V7"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            CTR
          </Link>
          <nav className={styles.nav}>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(pathname, item.href) ? styles.navActive : styles.navLink}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className={styles.right}>
          <span className={running ? styles.pillOn : styles.pill}>
            <span className={styles.dot} />
            {running ? (activeCount > 1 ? `${activeCount} running` : "Running") : "Stopped"}
          </span>
          <button type="button" onClick={logout} className={styles.logout}>
            Log out
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {title && (
          <div className={styles.heading}>
            <div>
              {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
              <h1 className={styles.title}>{title}</h1>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            {actions}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
