import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { googleConfigured } from "@/server/env";
import { syncGoogle } from "@/server/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sync the signed-in user's Google Calendar now. */
export async function POST() {
  if (!googleConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const sb = await getServerSupabase();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await syncGoogle(getAdminSupabase(), data.user.id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
