/** Shared AU IANA zones for campaign schedule display + placement. */
export const AU_TIMEZONE_OPTIONS = [
  { value: "Australia/Adelaide", label: "Adelaide (ACST/ACDT)" },
  { value: "Australia/Sydney", label: "Sydney / Canberra (AEST/AEDT)" },
  { value: "Australia/Melbourne", label: "Melbourne (AEST/AEDT)" },
  { value: "Australia/Brisbane", label: "Brisbane (AEST)" },
  { value: "Australia/Perth", label: "Perth (AWST)" },
  { value: "Australia/Hobart", label: "Hobart (AEST/AEDT)" },
  { value: "Australia/Darwin", label: "Darwin (ACST)" },
] as const;

const REGION_TIMEZONES: Record<string, string> = {
  NSW: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  QLD: "Australia/Brisbane",
  WA: "Australia/Perth",
  SA: "Australia/Adelaide",
  TAS: "Australia/Hobart",
  ACT: "Australia/Sydney",
  NT: "Australia/Darwin",
};

export function timezoneForRegion(regionCode: string): string | null {
  if (!regionCode || regionCode === "ALL") return null;
  return REGION_TIMEZONES[regionCode.toUpperCase()] ?? null;
}

export function timezoneLabel(timeZone: string): string {
  return AU_TIMEZONE_OPTIONS.find((row) => row.value === timeZone)?.label ?? timeZone;
}

/** Format an instant in the campaign schedule timezone (en-AU, 24h). */
export function formatInTimezone(iso: string | Date, timeZone: string): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: timeZone || "Australia/Adelaide",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleString("en-AU");
  }
}
