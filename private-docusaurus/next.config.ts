import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  rewrites: async () => [
    {
      source: "/saurus/:path*", destination: "/saurus/:path*/index.html"
    }
  ]
};

export default nextConfig;
