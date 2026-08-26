"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredPassword, isAuthenticated, verifyStoredPassword } from "../../lib/auth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!isAuthenticated()) {
        router.replace("/login");
        return;
      }

      const valid = await verifyStoredPassword();
      if (!valid) {
        clearStoredPassword();
        router.replace("/login");
        return;
      }

      setReady(true);
    })();
  }, [router]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
