import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/env";

// Leaves the demo. The demo data stays in this browser so it can be imported after sign-up.
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login?from=demo", request.nextUrl.origin));
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
