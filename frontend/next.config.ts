import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "drinking-lusty-outweigh.ngrok-free.dev",
  ],
  async rewrites() {
    return [
      {
        source: "/rtc/:path*",
        destination: "http://127.0.0.1:7880/rtc/:path*",
      },
    ];
  },
};

export default nextConfig;
