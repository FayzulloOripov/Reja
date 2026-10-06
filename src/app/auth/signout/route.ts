import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  const login = new URL("/login", request.nextUrl.origin);
  const next = safeNext(request.nextUrl.searchParams.get("next"), "");
  if (next) login.searchParams.set("next", next);
  return NextResponse.redirect(login, { status: 303 });
}
