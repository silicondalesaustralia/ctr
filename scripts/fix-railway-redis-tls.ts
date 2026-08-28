#!/usr/bin/env node
import { config } from "dotenv";
import { execFileSync } from "node:child_process";

config();

const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) {
  throw new Error("REDIS_URL is not set in .env");
}

const tlsUrl = redisUrl.startsWith("rediss://")
  ? redisUrl
  : redisUrl.replace(/^redis:\/\//, "rediss://");

for (const service of ["ctr", "worker"]) {
  execFileSync("railway", ["variable", "set", `REDIS_URL=${tlsUrl}`, "--service", service], {
    stdio: "inherit",
  });
  console.log(`Updated REDIS_URL on ${service}`);
}

execFileSync("railway", ["up", "--service", "worker", "--detach", "-y"], { stdio: "inherit" });
console.log("Redeployed worker");
