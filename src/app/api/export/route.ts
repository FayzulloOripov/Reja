import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toCSV } from "@/lib/csv";
import { EXPORT_TABLES, exportFileName, taskCsvRows } from "@/lib/export";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.object({ workspace: z.uuid(), format: z.enum(["json", "csv"]).default("json") });

// Everything is read with the user's session, so RLS limits the export to what they can see.
async function all(sb: Awaited<ReturnType<typeof getServerSupabase>>, table: string, workspace: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").eq("workspace_id", workspace).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { workspace, format } = parsed.data;
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: ws } = await sb.from("workspaces").select("id, name").eq("id", workspace).maybeSingle();
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (format === "csv") {
    const [tasks, projects, sections] = await Promise.all([all(sb, "tasks", workspace), all(sb, "projects", workspace), all(sb, "sections", workspace)]);
    return new NextResponse("\ufeff" + toCSV(taskCsvRows(tasks, projects, sections)), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${exportFileName(ws.name, "csv")}"` },
    });
  }

  const data: Record<string, unknown> = { exported_at: new Date().toISOString(), workspace: ws };
  for (const table of EXPORT_TABLES) data[table] = await all(sb, table, workspace);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${exportFileName(ws.name, "json")}"` },
  });
}
