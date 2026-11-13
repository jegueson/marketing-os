"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { COMPANY } from "@/demo/data/company";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function DemoShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative z-10 flex min-h-screen">
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 border-y-0 border-l-0 lg:block">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {menuOpen ? (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              key="drawer"
              className="glass fixed inset-y-0 left-0 z-50 w-72 lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMenuOpen(true)} />
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-8"
        >
          {children}
        </motion.main>
        <footer className="px-8 pb-6 text-center text-xs text-muted/80">{COMPANY.legalNote}</footer>
      </div>
    </div>
  );
}
