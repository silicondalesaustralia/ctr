import { z } from "zod";

function buildDatabaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  if (env.DATABASE_URL?.trim()) {
    return env.DATABASE_URL.trim();
  }

  const alias =
    env.POSTGRES_PRISMA_URL ??
    env.POSTGRES_URL ??
    env.DATABASE_URL_UNPOOLED ??
    env.POSTGRES_URL_NON_POOLING;

  if (alias?.trim()) {
    return alias.trim();
  }

  const host = env.PGHOST ?? env.POSTGRES_HOST;
  const user = env.PGUSER ?? env.POSTGRES_USER;
  const password = env.PGPASSWORD ?? env.POSTGRES_PASSWORD;
  const database = env.PGDATABASE ?? env.POSTGRES_DATABASE;

  if (host && user && password && database) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}?sslmode=require`;
  }

  return undefined;
}

function prepareEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const databaseUrl = buildDatabaseUrl(env);

  if (databaseUrl) {
    env.DATABASE_URL = databaseUrl;
  }

  if (env.PORT) {
    env.API_PORT = env.PORT;
  } else if (!env.API_PORT) {
    env.API_PORT = "3001";
  }

  return env;
}

function reportMissingDatabaseEnv(): void {
  const hints = [
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "PGHOST + PGUSER + PGPASSWORD + PGDATABASE",
  ];
  const present = Object.keys(process.env).filter(
    (key) =>
      key.includes("DATABASE") ||
      key.includes("POSTGRES") ||
      key.startsWith("PG"),
  );

  console.error("FATAL: No database connection string found.");
  console.error(`Set one of: ${hints.join(", ")}`);
  console.error(
    `Railway: open your API service → Variables → Raw Editor → add DATABASE_URL=your-neon-pooled-url`,
  );
  console.error(
    `Env keys present (names only): ${present.length ? present.join(", ") : "(none)"}`,
  );
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BROWSER_PROFILE_PROVIDER: z.enum(["mock", "gologin", "multilogin"]).default("mock"),
  PROXY_PROVIDER: z.enum(["mock", "decodo"]).default("mock"),
  DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  EXPERIMENT_RUNNER_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  GOLOGIN_API_TOKEN: z.string().optional(),
  MULTILOGIN_API_TOKEN: z.string().optional(),
  DECODO_RESIDENTIAL_PROXY_HOST: z.string().optional(),
  DECODO_RESIDENTIAL_PROXY_PORT: z.string().optional(),
  DECODO_RESIDENTIAL_PROXY_USERNAME: z.string().optional(),
  DECODO_RESIDENTIAL_PROXY_PASSWORD: z.string().optional(),
  DECODO_MOBILE_PROXY_HOST: z.string().optional(),
  DECODO_MOBILE_PROXY_PORT: z.string().optional(),
  DECODO_MOBILE_PROXY_USERNAME: z.string().optional(),
  DECODO_MOBILE_PROXY_PASSWORD: z.string().optional(),
  DECODO_PROXY_HOST: z.string().optional(),
  DECODO_PROXY_PORT: z.string().optional(),
  DECODO_PROXY_USERNAME: z.string().optional(),
  DECODO_PROXY_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  GSC_CLIENT_ID: z.string().optional(),
  GSC_CLIENT_SECRET: z.string().optional(),
  GSC_REFRESH_TOKEN: z.string().optional(),
  GSC_SITE_URL: z.string().optional(),
  GSC_OAUTH_REDIRECT_URI: z.string().optional(),
  DASHBOARD_URL: z.string().optional(),
  GA4_PROPERTY_ID: z.string().optional(),
  ADMIN_API_KEY: z
    .string()
    .default("dev-admin-key")
    .transform((value) => value.trim()),
  DASHBOARD_PASSWORD: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  API_PORT: z.string().optional().transform((v) => Number(v ?? "3001")),
  RUN_INTEGRATION: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    const prepared = prepareEnv();
    if (!prepared.DATABASE_URL) {
      reportMissingDatabaseEnv();
    }
    cachedEnv = envSchema.parse(prepared);
  }
  return cachedEnv;
}

/** Password for dashboard login. Falls back to ADMIN_API_KEY for API/script auth. */
export function getDashboardPassword(): string {
  const env = getEnv();
  return env.DASHBOARD_PASSWORD ?? env.ADMIN_API_KEY;
}

export function isValidDashboardPassword(candidate: string | undefined): boolean {
  if (!candidate?.trim()) {
    return false;
  }
  return candidate.trim() === getDashboardPassword();
}

export function isDryRun(): boolean {
  return getEnv().DRY_RUN;
}

export function isRunnerEnabled(): boolean {
  return getEnv().EXPERIMENT_RUNNER_ENABLED;
}

export async function isRunnerEnabledAsync(): Promise<boolean> {
  if (!getEnv().EXPERIMENT_RUNNER_ENABLED) return false;
  try {
    const { prisma } = await import("../db/client.js");
    const setting = await prisma.appSetting.findUnique({ where: { key: "runner_enabled" } });
    return setting?.value !== "false";
  } catch {
    return getEnv().EXPERIMENT_RUNNER_ENABLED;
  }
}
