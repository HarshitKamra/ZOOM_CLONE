import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A meeting join opens one socket. Strict remounts in dev would create a second participant.
  reactStrictMode: false,
  poweredByHeader: false,
};

export default nextConfig;
