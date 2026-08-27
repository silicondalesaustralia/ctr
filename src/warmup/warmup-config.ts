export const WARMUP_MIN_DAYS = 2;
export const WARMUP_MIN_SESSIONS = 10;
export const WARMUP_MIN_SITE_CLICKS = 2;
export const WARMUP_SESSION_COUNT = 10;
export const WARMUP_SPREAD_DAYS = 14;

export const WARMUP_SYSTEM_SLUG = "__warmup__";

const GENERIC_QUERIES = [
  "weather today",
  "news australia",
  "abc news",
  "australian open",
  "coles specials",
  "bunnings opening hours",
  "footy scores",
  "sydney weather",
  "melbourne weather",
  "brisbane weather",
  "recipes dinner",
  "public holidays 2026",
  "train timetable",
  "nearby cafes",
  "movie times",
];

const CITY_QUERIES: Record<string, string[]> = {
  Sydney: ["things to do sydney", "sydney restaurants", "sydney weather"],
  Melbourne: ["things to do melbourne", "melbourne weather", "melbourne cafes"],
  Brisbane: ["brisbane weather", "things to do brisbane", "gold coast day trip"],
  Perth: ["perth weather", "things to do perth", "rottnest ferry"],
  Adelaide: ["adelaide weather", "adelaide hills wineries", "adelaide markets"],
  Hobart: ["hobart weather", "mona museum", "tasmania travel"],
  Canberra: ["canberra weather", "parliament house visit", "canberra restaurants"],
  Darwin: ["darwin weather", "kakadu national park", "mindil beach markets"],
};

export function pickWarmupQuery(city: string, index: number): string {
  const cityQueries = CITY_QUERIES[city] ?? [];
  const pool = [...cityQueries, ...GENERIC_QUERIES];
  return pool[index % pool.length] ?? GENERIC_QUERIES[0]!;
}
