"use client";

import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastTone = "success" | "info" | "warning";
type Toast = { id: number; tone: ToastTone; title: string; body?: string };
type Notify = (toast: Omit<Toast, "id">) => void;

const ToastContext = createContext<Notify>(() => undefined);

const TOAST_MS = 3800;
const ICONS = { success: CircleCheck, info: Info, warning: TriangleAlert } as const;
const TONE_CLASS = { success: "text-success", info: "text-accent", warning: "text-warning" } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback<Notify>((toast) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-5 bottom-5 z-[70] flex w-80 flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="glass pointer-events-auto flex gap-3 rounded-xl p-3.5 shadow-xl"
              >
                <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${TONE_CLASS[toast.tone]}`} />
                <div className="text-sm">
                  <p className="font-medium">{toast.title}</p>
                  {toast.body ? <p className="mt-0.5 text-muted">{toast.body}</p> : null}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  return useContext(ToastContext);
}
