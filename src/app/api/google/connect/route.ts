import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/env";
import { GOOGLE_SCOPES } from "@/lib/google-calendar";
import { getServerSupabase } from "@/lib/supabase/server";
import { googleConfigured, serverEnv } from "@/server/env";

export const dynamic = "force-dynamic";

/** Start the Google OAuth consent (offline access, so the server can sync in the background). */
export async function GET() {
  if (!googleConfigured()) return NextResponse.redirect(`${siteUrl()}/settings/integrations?google=unavailable`);
  const sb = await getServerSupabase();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.redirect(`${siteUrl()}/login`);
  const state = randomBytes(24).toString("base64url");
  const q = new URLSearchParams({
    client_id: serverEnv.googleClientId,
    redirect_uri: `${siteUrl()}/api/google/callback`,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  res.cookies.set("reja_google_state", state, { httpOnly: true, secure: siteUrl().startsWith("https"), sameSite: "lax", path: "/api/google", maxAge: 600 });
  return res;
}
