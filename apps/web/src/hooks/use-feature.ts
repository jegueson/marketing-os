"use client";

import { useMemo } from "react";
import { isEnabled, type FlagContext } from "@marketing-os/core";

export function useFeature(flag: string, context: FlagContext = {}): boolean {
  return useMemo(() => isEnabled(flag, context), [flag, context]);
}
