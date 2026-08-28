import { createHash } from "node:crypto";

export const WARMUP_MIN_DAYS = 4;
export const WARMUP_BENIGN_SITE_CLICKS = 3;
export const WARMUP_SPREAD_DAYS = 4;
export const WARMUP_GRADUATION_RETRY_HOURS = 36;
export const WARMUP_BENIGN_RETRY_HOURS = 24;
export const WARMUP_SYSTEM_SLUG = "__warmup__";

const BENIGN_QUERIES = [
  "weather today",
  "news australia",
  "abc news",
  "australian open",
  "coles specials",
  "bunnings opening hours",
  "footy scores",
  "recipes dinner",
  "public holidays 2026",
  "train timetable",
  "nearby cafes",
  "movie times",
  "sydney weather",
  "melbourne weather",
  "brisbane weather",
];

const CITY_BENIGN: Record<string, string[]> = {
  Sydney: ["things to do sydney", "sydney restaurants"],
  Melbourne: ["things to do melbourne", "melbourne cafes"],
  Brisbane: ["things to do brisbane", "gold coast day trip"],
  Perth: ["things to do perth", "rottnest ferry"],
  Adelaide: ["adelaide hills wineries", "adelaide markets"],
  Hobart: ["mona museum", "tasmania travel"],
  Canberra: ["parliament house visit", "canberra restaurants"],
  Darwin: ["kakadu national park", "mindil beach markets"],
};

/** Generic commercial AU queries — one assigned permanently per identity via hash. */
const GRADUATION_QUERY_TEMPLATES = [
  "plumber near me",
  "electrician {city}",
  "lawyer {city}",
  "buy shoes online australia",
  "buy running shoes online",
  "furniture stores online",
  "supermarket prices",
  "car insurance compare",
  "dentist {city}",
  "mechanic {city}",
  "accountant near me",
  "real estate agents {city}",
  "restaurants {city}",
  "hotels {city}",
  "flights to {city}",
  "petrol prices today",
  "mobile phone plans compare",
  "home loan calculator",
  "pest control {city}",
  "cleaning services {city}",
  "locksmith near me",
  "roof repairs {city}",
  "landscaping {city}",
  "physiotherapist {city}",
  "optometrist near me",
  "vet near me",
  "hairdresser {city}",
  "gym membership deals",
  "used cars for sale",
  "mortgage broker {city}",
  "solar panels cost australia",
  "internet providers compare",
  "removalists {city}",
  "building inspector {city}",
  "architect {city}",
  "graphic designer hire",
  "web design agency {city}",
  "marketing agency {city}",
  "bookkeeper near me",
  "tax accountant {city}",
  "conveyancer {city}",
  "personal trainer {city}",
  "yoga classes {city}",
  "swimming lessons {city}",
  "driving school {city}",
  "tyre shop near me",
  "windscreen repair",
  "car wash near me",
  "cafes near me",
  "pizza delivery {city}",
  "bottle shop near me",
  "pharmacy near me open now",
  "hardware store near me",
  "office chairs online",
  "laptop deals australia",
  "mattress sale online",
  "white goods sale",
  "air conditioner installation",
  "blocked drain plumber",
  "tree lopping {city}",
  "fence builder {city}",
  "kitchen renovation cost",
  "bathroom renovation {city}",
  "architectural designer {city}",
  "chiro near me",
  "massage {city}",
  "day spa {city}",
  "wedding photographer {city}",
  "florist {city}",
  "catering {city}",
  "storage units {city}",
  "self storage near me",
  "print shop near me",
  "dry cleaner near me",
  "laundromat near me",
  "nanny agency {city}",
  "tutoring {city}",
  "music lessons {city}",
  "dance classes {city}",
  "martial arts {city}",
  "swim school {city}",
  "childcare {city}",
  "aged care facilities {city}",
  "NDIS provider {city}",
];

function fillCity(template: string, city: string): string {
  return template.replace(/\{city\}/gi, city.toLowerCase());
}

export function pickBenignWarmupQuery(city: string, index: number): string {
  const cityQueries = CITY_BENIGN[city] ?? [];
  const pool = [...cityQueries, ...BENIGN_QUERIES];
  return pool[index % pool.length] ?? BENIGN_QUERIES[0]!;
}

export function pickGraduationQuery(externalId: string, city: string): string {
  const hash = createHash("sha256").update(externalId).digest();
  const index = hash.readUInt32BE(0) % GRADUATION_QUERY_TEMPLATES.length;
  return fillCity(GRADUATION_QUERY_TEMPLATES[index]!, city);
}

/** @deprecated Use pickBenignWarmupQuery */
export function pickWarmupQuery(city: string, index: number): string {
  return pickBenignWarmupQuery(city, index);
}

export function graduationQueryPoolSize(): number {
  return GRADUATION_QUERY_TEMPLATES.length;
}
