import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project so Turbopack doesn't pick up a
    // stray package-lock.json in a parent directory (e.g. C:\Users\pcn).
    root: __dirname,
  },
};

export default nextConfig;
