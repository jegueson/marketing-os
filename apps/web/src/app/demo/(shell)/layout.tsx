import type { ReactNode } from "react";
import { DemoShell } from "@/demo/components/shell/demo-shell";

export default function DemoShellLayout({ children }: { children: ReactNode }) {
  return <DemoShell>{children}</DemoShell>;
}
