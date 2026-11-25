import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { DemoProviders } from "@/demo/components/demo-providers";
import "./demo.css";

// next/font self-hosts the files, which keeps CSP font-src at 'self'.
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Marketing OS · Investor demo",
  description: "Interactive product mockup with fictional data.",
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <DemoProviders fontClassName={`${sans.variable} ${mono.variable}`}>{children}</DemoProviders>;
}
