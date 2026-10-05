import { NextResponse, type NextRequest } from "next/server";
import { siteUrl } from "@/lib/env";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Item {
  kind: "task" | "block";
  id: string;
  title: string;
  due_date: string | null;
  due_at: string | null;
  estimate_min: number | null;
  start_at: string | null;
  end_at: string | null;
  status: string;
  project_name: string | null;
  updated_at: string;
}

/** Private calendar feed. The token is revocable from Settings → Telegram & calendar. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/ics/[token]">) {
  const { token: raw } = await ctx.params;
  const token = raw.replace(/\.ics$/, "");
  if (!/^[a-f0-9]{32,64}$/.test(token)) return new NextResponse("not found", { status: 404 });
  if (!(await rateLimit(`ics:${await clientIp()}`, 60, 60))) return new NextResponse("slow down", { status: 429 });

  const { data, error } = await getAdminSupabase().rpc("ics_items", { p_token: token });
  if (error) return new NextResponse("error", { status: 500 });
  const items = (data ?? []) as Item[];
  if (!items.length) {
    // unknown token or empty calendar: both return an empty, valid calendar after a constant-time lookup
  }
  const base = siteUrl();
  const events: IcsEvent[] = items.map((i) => {
    if (i.kind === "block") {
      return { uid: `block-${i.id}@reja`, title: `🕒 ${i.title}`, start: new Date(i.start_at!), end: new Date(i.end_at!), updated: new Date(i.updated_at) };
    }
    const url = `${base}/tasks/${i.id}`;
    const description = [i.project_name, url].filter(Boolean).join("\n");
    if (i.due_at) {
      const start = new Date(i.due_at);
      return { uid: `task-${i.id}@reja`, title: i.title, description, url, start, end: new Date(start.getTime() + (i.estimate_min ?? 30) * 60_000), completed: i.status === "done", updated: new Date(i.updated_at) };
    }
    return { uid: `task-${i.id}@reja`, title: i.title, description, url, date: i.due_date!, completed: i.status === "done", updated: new Date(i.updated_at) };
  });
  return new NextResponse(buildIcs("Reja", events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="reja.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
