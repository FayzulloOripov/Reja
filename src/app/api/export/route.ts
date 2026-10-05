import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toCSV } from "@/lib/csv";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.object({ workspace: z.uuid(), format: z.enum(["json", "csv"]).default("json") });

// Everything is read with the user's session, so RLS limits the export to what they can see.
const TABLES = [
  "projects",
  "project_members",
  "sections",
  "tasks",
  "task_assignees",
  "task_watchers",
  "task_dependencies",
  "labels",
  "task_labels",
  "checklist_items",
  "comments",
  "comment_reactions",
  "attachments",
  "time_entries",
  "goals",
  "key_results",
  "key_result_history",
  "notes",
  "saved_views",
  "templates",
] as const;

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
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = ws.name.replace(/[^\p{L}\p{N}_-]+/gu, "-");

  if (format === "csv") {
    const [tasks, projects, sections] = await Promise.all([all(sb, "tasks", workspace), all(sb, "projects", workspace), all(sb, "sections", workspace)]);
    const pname = new Map(projects.map((p) => [p.id as string, p.name as string]));
    const sname = new Map(sections.map((s) => [s.id as string, s.name as string]));
    const rows = tasks
      .filter((t) => !t.deleted_at)
      .map((t) => ({
        title: t.title,
        project: t.project_id ? (pname.get(t.project_id as string) ?? "") : "",
        section: t.section_id ? (sname.get(t.section_id as string) ?? "") : "",
        status: t.status,
        priority: t.priority,
        due: t.due_date ?? "",
        due_at: t.due_at ?? "",
        start: t.start_date ?? "",
        deadline: t.deadline ?? "",
        estimate_min: t.estimate_min ?? "",
        recurrence: t.recurrence ?? "",
        completed_at: t.completed_at ?? "",
        created_at: t.created_at,
        id: t.id,
      }));
    return new NextResponse("\ufeff" + toCSV(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reja-${safeName}-${stamp}.csv"` },
    });
  }

  const data: Record<string, unknown> = { exported_at: new Date().toISOString(), workspace: ws };
  for (const table of TABLES) data[table] = await all(sb, table, workspace);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="reja-${safeName}-${stamp}.json"` },
  });
}
