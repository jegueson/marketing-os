"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { TourProvider } from "@/demo/tour/tour-provider";
import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toast";

/** Everything /demo needs on the client. `reducedMotion="user"` honours the OS setting. */
export function DemoProviders({ fontClassName, children }: { fontClassName: string; children: ReactNode }) {
  return (
    <ThemeProvider>
      {(theme) => (
        <MotionConfig reducedMotion="user">
          <div className={`mos ${theme} ${fontClassName} min-h-screen`}>
            <div className="mos-ambient" aria-hidden="true" />
            <ToastProvider>
              <TourProvider>{children}</TourProvider>
            </ToastProvider>
          </div>
        </MotionConfig>
      )}
    </ThemeProvider>
  );
}
