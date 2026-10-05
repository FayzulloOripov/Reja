import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { LogoMark } from "@/components/brand/logo";
import { safeColor } from "@/lib/colors";
import { todayIn } from "@/lib/dates";
import { FORCED_DEMO } from "@/lib/env";
import { projectStats } from "@/lib/health";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Project, Section, Task } from "@/lib/types";
import { monthNames } from "@/server/i18n";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Public read-only project page. Access is granted by an unguessable, revocable token stored on
 * the project; the service role is used only after the token matches, and only safe columns are
 * returned. RLS policies are never loosened for this.
 */
export default async function SharePage(props: PageProps<"/share/[token]">) {
  const { token } = await props.params;
  if (FORCED_DEMO || !/^[a-zA-Z0-9]{32,64}$/.test(token)) notFound();
  const t = await getTranslations();
  const locale = await getLocale();
  const admin = getAdminSupabase();
  const { data: project } = await admin
    .from("projects")
    .select("id, name, color, goal, target_date, status, share_token, deleted_at")
    .eq("share_token", token)
    .is("deleted_at", null)
    .maybeSingle<Pick<Project, "id" | "name" | "color" | "goal" | "target_date" | "status" | "share_token" | "deleted_at">>();
  if (!project) notFound();

  const [{ data: sections }, { data: tasks }] = await Promise.all([
    admin.from("sections").select("id, name, position").eq("project_id", project.id).is("deleted_at", null).order("position"),
    admin.from("tasks").select("id, title, status, priority, due_date, deadline, section_id, parent_id, position, deleted_at").eq("project_id", project.id).is("deleted_at", null).order("position"),
  ]);
  const list = (tasks ?? []) as Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "deadline" | "section_id" | "parent_id" | "position" | "deleted_at">[];
  const secs = (sections ?? []) as Pick<Section, "id" | "name" | "position">[];
  const top = list.filter((x) => !x.parent_id && x.status !== "cancelled");
  const stats = projectStats(top, todayIn("Asia/Tashkent"));
  const months = monthNames(locale);
  const fmt = (d: string) => `${Number(d.slice(8))} ${months[Number(d.slice(5, 7)) - 1]}`;
  const groups = [
    { id: null as string | null, name: t("project.noSection") },
    ...secs.map((s) => ({ id: s.id as string | null, name: s.name })),
  ]
    .map((g) => ({ ...g, tasks: top.filter((x) => (x.section_id ?? null) === g.id && (g.id !== null || !secs.some((s) => s.id === x.section_id))) }))
    .filter((g) => g.tasks.length);

  return (
    <main data-color={safeColor(project.color)} className="min-h-dvh bg-background">
      <div className="h-1.5 bg-pc" />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{t("share.readOnly")}</p>
        <h1 className="text-28 font-bold sm:text-36">{project.name}</h1>
        {project.goal && <p className="mt-2 text-muted-foreground">{project.goal}</p>}
        <div className="mt-6 rounded-2xl border bg-card p-4 shadow-elev-1">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">{t("project.progress")}</p>
            <p className="text-28 font-bold tnum">{stats.percentDone}%</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-pc" style={{ width: `${stats.percentDone}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground tnum">
            {t("common.of", { done: stats.done, total: stats.total })}
            {project.target_date && ` · ${t("project.targetDate")}: ${fmt(project.target_date)}`}
          </p>
        </div>
        <div className="mt-8 space-y-6">
          {groups.map((g) => (
            <section key={g.id ?? "none"}>
              <h2 className="mb-2 font-sans text-13 font-semibold tracking-normal text-muted-foreground">{g.name}</h2>
              <ul className="divide-y rounded-2xl border bg-card shadow-elev-1">
                {g.tasks.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className={x.status === "done" ? "flex size-4 items-center justify-center rounded-full bg-success text-[10px] text-white" : "size-4 rounded-full border-2 border-border-strong"} aria-hidden>
                      {x.status === "done" ? "✓" : ""}
                    </span>
                    <span className={x.status === "done" ? "flex-1 text-muted-foreground line-through" : "flex-1"}>{x.title}</span>
                    {x.due_date && <span className="text-xs text-muted-foreground tnum">{fmt(x.due_date)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <LogoMark className="size-5" /> {t("share.poweredBy")}
        </p>
      </div>
    </main>
  );
}
