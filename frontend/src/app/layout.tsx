import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Saffron & Smoke — Order online", template: "%s · Saffron & Smoke" },
  description: "Order 100% vegetarian Indian food online for pickup or delivery from Saffron & Smoke.",
};

export const viewport: Viewport = { themeColor: "#171721" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
