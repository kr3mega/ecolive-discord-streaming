import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "drinking-lusty-outweigh.ngrok-free.dev",
    "*.trycloudflare.com",
    "taken-eligibility-uniprotkb-magical.trycloudflare.com",
    "*.discordsays.com",
    "*.sslip.io",
  ],
  async rewrites() {
    return [
      {
        source: "/livekit/:path*",
        destination: "http://127.0.0.1:7880/:path*",
      },
      {
        source: "/rtc/:path*",
        destination: "http://127.0.0.1:7880/rtc/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
