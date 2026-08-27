/** Production Railway API — used when NEXT_PUBLIC_API_URL is missing from the Vercel build. */
export const PRODUCTION_RAILWAY_API = "https://ctr-production-d742.up.railway.app";

export function resolveRailwayOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (configured && /^https?:\/\//.test(configured) && !configured.includes("localhost")) {
    return configured;
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.includes("vercel.app") || host === "ctr-teal.vercel.app") {
      return PRODUCTION_RAILWAY_API;
    }
  }

  return configured ?? null;
}
