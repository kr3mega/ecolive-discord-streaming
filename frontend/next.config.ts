import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.trycloudflare.com",
    "*.discordsays.com",
    "*.sslip.io",
  ],
  async rewrites() {
    const livekitTarget = process.env.LIVEKIT_URL || "http://127.0.0.1:7880";
    return [
      {
        source: "/livekit/rtc",
        destination: `${livekitTarget}/rtc`,
      },
      {
        source: "/livekit/rtc/:path*",
        destination: `${livekitTarget}/rtc/:path*`,
      },
      {
        source: "/rtc",
        destination: `${livekitTarget}/rtc`,
      },
      {
        source: "/rtc/:path*",
        destination: `${livekitTarget}/rtc/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://*.discordsays.com https://discord.com https://*.discord.com;",
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
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
