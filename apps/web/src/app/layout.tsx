import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { AuthProvider } from "@/components/auth";
import "@/styles/brand.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata = {
  title: "Marketing OS",
  description: "AI Marketing Operating System",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="mos">
        <AuthProvider>
          <Suspense fallback={<p role="status">Loading…</p>}>{children}</Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
