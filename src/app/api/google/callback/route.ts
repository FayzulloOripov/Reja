import { NextResponse, type NextRequest } from "next/server";
import { siteUrl } from "@/lib/env";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";
import { googleConfigured } from "@/server/env";
import { exchangeCode, syncGoogle } from "@/server/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const back = (status: string) => {
    const res = NextResponse.redirect(`${siteUrl()}/settings/integrations?google=${status}`);
    res.cookies.delete({ name: "reja_google_state", path: "/api/google" });
    return res;
  };
  if (!googleConfigured()) return back("unavailable");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("reja_google_state")?.value) return back("error");
  const sb = await getServerSupabase();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.redirect(`${siteUrl()}/login`);
  try {
    const tokens = await exchangeCode(code, `${siteUrl()}/api/google/callback`);
    const admin = getAdminSupabase();
    const { data: existing } = await admin.from("google_connections").select("refresh_token").eq("user_id", data.user.id).maybeSingle();
    const refresh = tokens.refreshToken ?? (existing?.refresh_token as string | undefined);
    if (!refresh) return back("error");
    await admin.from("google_connections").upsert({
      user_id: data.user.id,
      email: tokens.email,
      refresh_token: refresh,
      access_token: tokens.accessToken,
      access_expires_at: tokens.expiresAt,
      last_error: null,
    });
    await syncGoogle(admin, data.user.id).catch(() => {});
    return back("connected");
  } catch {
    return back("error");
  }
}
