import "server-only";
import { cookies } from "next/headers";
import { DEMO_COOKIE, FORCED_DEMO } from "@/lib/env";

/** True when this request should see the demo: the whole deployment is a demo, or the visitor opened /demo. */
export async function isDemoRequest(): Promise<boolean> {
  if (FORCED_DEMO) return true;
  return (await cookies()).get(DEMO_COOKIE)?.value === "1";
}
