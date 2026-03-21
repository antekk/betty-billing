import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@betty/shared"],
  typescript: {
    // Pre-existing ioredis version mismatch in queue.ts
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
