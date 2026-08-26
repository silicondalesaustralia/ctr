import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export function logSessionEvent(
  event: string,
  data: Record<string, unknown>,
): void {
  logger.info({ event, ...data });
}
