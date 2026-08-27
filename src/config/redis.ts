import { Redis, type RedisOptions } from "ioredis";
import { getEnv } from "./env.js";

export function createRedisConnection(): Redis {
  const url = getEnv().REDIS_URL;
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
    enableReadyCheck: true,
  };

  if (url.startsWith("rediss://")) {
    options.tls = {};
  }

  return new Redis(url, options);
}
