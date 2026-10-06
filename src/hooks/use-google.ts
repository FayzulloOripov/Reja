"use client";

import { useEffect, useState } from "react";
import { refresh, useStore } from "@/store/store";

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

let cached: GoogleStatus | null = null;
const listeners = new Set<(s: GoogleStatus) => void>();

/** Google Calendar status for the signed-in user (null while loading; never in the demo). */
export function useGoogleStatus(): GoogleStatus | null {
  const kind = useStore((s) => s.adapter?.kind);
  const [status, setStatus] = useState<GoogleStatus | null>(cached);
  useEffect(() => {
    listeners.add(setStatus);
    if (kind === "supabase" && !cached) void reloadGoogleStatus();
    return () => {
      listeners.delete(setStatus);
    };
  }, [kind]);
  return kind === "supabase" ? status : { configured: false, connected: false };
}

export async function reloadGoogleStatus() {
  try {
    const res = await fetch("/api/google/status", { cache: "no-store" });
    cached = (await res.json()) as GoogleStatus;
  } catch {
    cached = { configured: false, connected: false };
  }
  for (const l of listeners) l(cached);
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Sync soon (debounced): after a synced time block changes. Reloads the store afterwards. */
export function requestGoogleSync(delay = 1500) {
  if (!cached?.connected) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    await fetch("/api/google/sync", { method: "POST" }).catch(() => {});
    await reloadGoogleStatus();
    await refresh();
  }, delay);
}
