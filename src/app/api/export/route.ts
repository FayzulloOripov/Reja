import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toCSV } from "@/lib/csv";
import { EXPORT_TABLES, exportFileName, taskCsvRows } from "@/lib/export";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.union([
  z.object({ scope: z.literal("account"), format: z.literal("json").default("json") }),
  z.object({ scope: z.literal("workspace").default("workspace"), workspace: z.uuid(), format: z.enum(["json", "csv"]).default("json") }),
]);

/** The user's own rows that live outside workspaces. */
const PERSONAL_TABLES = ["habits", "habit_logs", "time_blocks", "reminders", "weekly_reviews", "daily_shutdowns", "project_favorites", "notifications"] as const;

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
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (parsed.data.scope === "account") {
    // everything this person can see: every workspace, plus their personal rows
    const { data: workspaces } = await sb.from("workspaces").select("id, name").is("deleted_at", null);
    const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), profile, workspaces: [] as unknown[], personal: {} };
    for (const ws of workspaces ?? []) {
      const data: Record<string, unknown> = { workspace: ws };
      for (const table of EXPORT_TABLES) data[table] = await all(sb, table, ws.id);
      (out.workspaces as unknown[]).push(data);
      await sb.rpc("log_export", { p_workspace: ws.id, p_format: "account" });
    }
    for (const table of PERSONAL_TABLES) {
      const { data } = await sb.from(table).select("*").eq("user_id", user.id);
      (out.personal as Record<string, unknown>)[table] = data ?? [];
    }
    return new NextResponse(JSON.stringify(out, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${exportFileName("hammasi", "json")}"` },
    });
  }

  const { workspace, format } = parsed.data;
  const { data: ws } = await sb.from("workspaces").select("id, name").eq("id", workspace).maybeSingle();
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // the admins' audit log records every export
  await sb.rpc("log_export", { p_workspace: workspace, p_format: format });
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
