"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { TOUR_STEPS, type TourStep } from "./steps";
import { initialTourState, tourReducer } from "./tour-state";
import { TourOverlay } from "./tour-overlay";

type TourContextValue = {
  active: boolean;
  index: number;
  step: TourStep | null;
  start: () => void;
  next: () => void;
  prev: () => void;
  exit: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tourReducer, initialTourState);
  const router = useRouter();
  const pathname = usePathname();
  const step = state.active ? (TOUR_STEPS[state.index] ?? null) : null;

  // Follow the tour across pages.
  useEffect(() => {
    if (step && pathname !== step.route) router.push(step.route);
  }, [step, pathname, router]);

  const start = useCallback(() => dispatch({ type: "start", total: TOUR_STEPS.length }), []);
  const next = useCallback(() => dispatch({ type: "next" }), []);
  const prev = useCallback(() => dispatch({ type: "prev" }), []);
  const exit = useCallback(() => dispatch({ type: "exit" }), []);

  const value = useMemo(
    () => ({ active: state.active, index: state.index, step, start, next, prev, exit }),
    [state.active, state.index, step, start, next, prev, exit],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {step && pathname === step.route ? (
        <TourOverlay step={step} index={state.index} total={TOUR_STEPS.length} onNext={next} onPrev={prev} onExit={exit} />
      ) : null}
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const value = useContext(TourContext);
  if (!value) throw new Error("useTour must be used inside <TourProvider>");
  return value;
}
