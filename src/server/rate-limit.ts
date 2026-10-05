import "server-only";
import { headers } from "next/headers";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { serverEnv } from "./env";

// Fallback for local development without a service key. Per-instance only.
const memory = new Map<string, { start: number; count: number }>();

/** Fixed-window rate limit shared across serverless instances via Postgres. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  if (serverEnv.serviceKey) {
    const { data, error } = await getAdminSupabase().rpc("hit_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (!error) return Boolean(data);
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now - entry.start > windowSeconds * 1000) {
    memory.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
