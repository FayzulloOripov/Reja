"use client";

import { useStore } from "@/store/store";

/** True while the app runs on the in-browser demo adapter. */
export function useIsDemo(): boolean {
  return useStore((s) => s.adapter?.kind === "demo");
}

/** Same, for event handlers and non-React code. */
export function isDemo(): boolean {
  return useStore.getState().adapter?.kind === "demo";
}
