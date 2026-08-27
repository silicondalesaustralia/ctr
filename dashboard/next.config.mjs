import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const apiOrigin =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  (process.env.VERCEL ? "https://ctr-production-d742.up.railway.app" : "http://localhost:3001");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  env: {
    NEXT_PUBLIC_API_URL: apiOrigin,
    NEXT_PUBLIC_API_KEY: process.env.NEXT_PUBLIC_API_KEY ?? "dev-admin-key",
  },
};

export default nextConfig;
