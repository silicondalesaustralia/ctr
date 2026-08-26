import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const querySchema = z.object({
  text: z.string().min(1),
  type: z.enum(["core", "close_variation", "semantic", "local", "long_tail"]),
  weight: z.number().min(0).max(1),
});

const experimentConfigSchema = z.object({
  experiment: z.object({
    name: z.string().min(1),
    slug: z.string().min(1).optional(),
    target_url: z.string().url(),
    target_domain: z.string().min(1),
    sessions_per_month: z.number().int().positive().default(300),
    baseline_days: z.number().int().positive().default(28),
    treatment_days: z.number().int().positive().default(28),
    post_treatment_days: z.number().int().positive().default(21),
    queries: z.array(querySchema).min(1),
  }),
  identities: z
    .object({
      total: z.number().int().positive().default(100),
      desktop_percent: z.number().min(0).max(100).default(65),
      mobile_percent: z.number().min(0).max(100).default(35),
    })
    .optional(),
  proxy: z
    .object({
      provider: z.enum(["decodo", "mock"]).default("mock"),
      country: z.string().default("AU"),
      sticky_per_session: z.boolean().default(true),
    })
    .optional(),
  search: z
    .object({
      max_serp_pages: z.number().int().positive().default(3),
    })
    .optional(),
  schedule: z
    .object({
      allowed_start: z.string().default("06:30"),
      allowed_end: z.string().default("23:00"),
      timezone: z.string().default("Australia/Adelaide"),
      max_sessions_per_identity_per_day: z.number().int().positive().default(1),
      repeat_identity_min_gap_days: z.number().int().positive().default(2),
      min_minutes_between_global_sessions: z.number().int().positive().default(5),
    })
    .optional(),
  engagement: z
    .object({
      read_only: z.number().min(0).max(1).default(0.35),
      internal_navigation: z.number().min(0).max(1).default(0.3),
      short_visit: z.number().min(0).max(1).default(0.15),
      long_read: z.number().min(0).max(1).default(0.2),
    })
    .optional(),
});

export type ExperimentConfig = z.infer<typeof experimentConfigSchema>;

export function loadExperimentConfig(filePath: string): ExperimentConfig {
  const raw = readFileSync(filePath, "utf8");
  const parsed = parseYaml(raw);
  const config = experimentConfigSchema.parse(parsed);

  const weightSum = config.experiment.queries.reduce((sum, q) => sum + q.weight, 0);
  if (Math.abs(weightSum - 1) > 0.001) {
    throw new Error(`Query weights must sum to 1.0, got ${weightSum}`);
  }

  if (config.engagement) {
    const engSum =
      config.engagement.read_only +
      config.engagement.internal_navigation +
      config.engagement.short_visit +
      config.engagement.long_read;
    if (Math.abs(engSum - 1) > 0.001) {
      throw new Error(`Engagement weights must sum to 1.0, got ${engSum}`);
    }
  }

  return config;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
