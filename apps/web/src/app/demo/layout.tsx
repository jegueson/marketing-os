import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { DemoProviders } from "@/demo/components/demo-providers";
import "./demo.css";

// next/font self-hosts the files, which keeps CSP font-src at 'self'.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Marketing OS · Investor demo",
  description: "Interactive product mockup with fictional data.",
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <DemoProviders fontClassName={`${inter.variable} ${mono.variable}`}>{children}</DemoProviders>;
}
