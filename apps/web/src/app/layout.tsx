import type { ReactNode } from "react";

export const metadata = {
  title: "Marketing OS",
  description: "AI Marketing Operating System",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
