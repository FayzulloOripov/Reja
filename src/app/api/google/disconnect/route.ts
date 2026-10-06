import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { disconnectGoogle } from "@/server/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const sb = await getServerSupabase();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await disconnectGoogle(getAdminSupabase(), data.user.id);
  return NextResponse.json({ ok: true });
}
