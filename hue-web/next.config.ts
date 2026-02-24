import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  // Turbopack warning fix - as suggested by Next.js error message
  // If top-level 'turbopack' fails, we might need a different approach
};

export default withPWA(nextConfig);
