import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@marketing-os/ui", "@marketing-os/core"],
};

export default nextConfig;
