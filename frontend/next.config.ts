import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // keep static generation light: low-RAM machines / CI runners OOM with parallel workers
  experimental: { cpus: 1, workerThreads: false },
};

export default nextConfig;
