export function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "/api";
  }

  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3001"
  );
}

export function buildApiUrl(path: string): string {
  const base = resolveApiBaseUrl().replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
