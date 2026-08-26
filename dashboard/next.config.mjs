/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: undefined,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
    NEXT_PUBLIC_API_KEY: process.env.NEXT_PUBLIC_API_KEY ?? "dev-admin-key",
  },
};

export default nextConfig;
