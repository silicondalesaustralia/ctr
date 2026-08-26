import { z } from "zod";

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
  DECODO_PROXY_HOST: z.string().optional(),
  DECODO_PROXY_PORT: z.string().optional(),
  DECODO_PROXY_USERNAME: z.string().optional(),
  DECODO_PROXY_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  GSC_CLIENT_ID: z.string().optional(),
  GSC_CLIENT_SECRET: z.string().optional(),
  GSC_REFRESH_TOKEN: z.string().optional(),
  GA4_PROPERTY_ID: z.string().optional(),
  ADMIN_API_KEY: z.string().default("dev-admin-key"),
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
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
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
