import type { NextConfig } from "next";

// Server-side target of the same-origin proxy (/api/v1/* -> backend). Baked into the routes manifest
// at build time, so in Docker it is passed as a build arg (e.g. http://api:8000).
const INTERNAL_API_URL = (process.env.INTERNAL_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  // the runner image does not get INTERNAL_API_URL at runtime: bake it in for server components / sitemap
  // (referenced only from server code, so it never reaches a browser bundle)
  env: { NJA_INTERNAL_API_URL: INTERNAL_API_URL },
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // keep static generation light: low-RAM machines / CI runners OOM with parallel workers
  experimental: { cpus: 1, workerThreads: false },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${INTERNAL_API_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
