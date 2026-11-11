"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "mos-demo-theme";

type ThemeContextValue = { theme: Theme; toggle: () => void };

const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", toggle: () => undefined });

export function ThemeProvider({ children }: { children: (theme: Theme) => ReactNode }) {
  // Dark is the default so the server render and first client render agree.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch (err) {
      console.warn("Theme preference unavailable", err);
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch (err) {
        console.warn("Theme preference not saved", err);
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children(theme)}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Recharts takes literal colors, so charts read hex values from here instead of CSS variables. */
export function useChartColors() {
  const { theme } = useTheme();
  return theme === "dark"
    ? {
        primary: "#3b82f6",
        accent: "#60a5fa",
        soft: "#93c5fd",
        grey: "#64748b",
        greyLight: "#334155",
        grid: "rgba(148,163,184,0.12)",
        axis: "#94a3b8",
        success: "#34d399",
        warning: "#fbbf24",
        danger: "#f87171",
        violet: "#a78bfa",
        series: ["#3b82f6", "#60a5fa", "#93c5fd", "#64748b", "#475569", "#cbd5e1"],
      }
    : {
        primary: "#2563eb",
        accent: "#3b82f6",
        soft: "#93c5fd",
        grey: "#64748b",
        greyLight: "#cbd5e1",
        grid: "rgba(15,23,42,0.07)",
        axis: "#64748b",
        success: "#047857",
        warning: "#b45309",
        danger: "#dc2626",
        violet: "#6d28d9",
        series: ["#2563eb", "#3b82f6", "#93c5fd", "#64748b", "#94a3b8", "#cbd5e1"],
      };
}
