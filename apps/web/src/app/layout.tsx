import { Suspense, type ReactNode } from "react";
import { AuthProvider } from "@/components/auth";

export const metadata = {
  title: "Marketing OS",
  description: "AI Marketing Operating System",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Suspense fallback={<p role="status">Loading…</p>}>{children}</Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
