import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API-only — no frontend pages
  transpilePackages: ["@betty/shared"],
};

export default nextConfig;
