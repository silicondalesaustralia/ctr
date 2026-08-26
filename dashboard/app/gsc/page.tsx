"use client";

import AuthGate from "../components/AuthGate";
import GscPage from "./GscPageClient";

export default function GscRoutePage() {
  return (
    <AuthGate>
      <GscPage />
    </AuthGate>
  );
}
