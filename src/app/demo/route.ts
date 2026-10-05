import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/env";

// Opens the demo: everything stays in this browser, nothing is sent to the server.
export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.nextUrl.origin));
  res.cookies.set(DEMO_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  return res;
}
