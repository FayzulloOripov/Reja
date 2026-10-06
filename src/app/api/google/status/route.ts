import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { googleConfigured } from "@/server/env";

export const dynamic = "force-dynamic";

/** Whether Google Calendar can be connected here, and the user's connection (never the tokens). */
export async function GET() {
  const configured = googleConfigured();
  const sb = await getServerSupabase();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ configured, connected: false });
  const { data: rows } = await sb.rpc("google_status");
  const row = (rows as { email: string | null; last_synced_at: string | null; last_error: string | null }[] | null)?.[0];
  return NextResponse.json({ configured, connected: Boolean(row), email: row?.email ?? null, lastSyncedAt: row?.last_synced_at ?? null, lastError: row?.last_error ?? null });
}
