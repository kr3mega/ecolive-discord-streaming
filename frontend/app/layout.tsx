import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SecurityConsoleBanner } from "@/components/SecurityConsoleBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EcoLive - Discord Streaming Activity",
  description: "EcoLive: Arquitetura de Nova Geração e Transmissão de Alta Performance para o Discord",
  icons: {
    icon: "/ecolive_icon.png",
    shortcut: "/ecolive_icon.png",
    apple: "/ecolive_icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SecurityConsoleBanner />
        {children}
      </body>
    </html>
  );
}
