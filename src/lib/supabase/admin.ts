import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import { serverEnv } from "@/server/env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — use only in server code that does its own authorisation
 * (scheduler, Telegram bot, ICS feed, public share page).
 */
export function getAdminSupabase(): SupabaseClient {
  if (!serverEnv.serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!admin) {
    admin = createClient(SUPABASE_URL, serverEnv.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
