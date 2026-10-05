"use client";

import { CalendarClock, LayoutDashboard, Target, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, ProgressBar, ProjectDot, UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { HealthPill } from "@/components/projects/project-header";
import { PageContainer } from "@/components/shell/app-client";
import { ActivityList } from "@/components/tasks/task-detail-sections";
import { Button } from "@/components/ui/button";
import { addDays, startOfWeek } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import { effectiveHealth, isOpen, isOverdue, suggestHealth } from "@/lib/health";
import type { ActivityEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { assigneesByTask, tasksByProject, useCurrentWorkspace, useMembers, useProjects, useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";

export default function OverviewPage() {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const ws = useCurrentWorkspace();
  const projects = useProjects(ws?.id);
  const members = useMembers(ws?.id);
  const tasks = useStore((s) => s.data.tasks);
  const assignees = useStore((s) => s.data.task_assignees);
  const goals = useStore((s) => s.data.goals);
  const krs = useStore((s) => s.data.key_results);
  const adapter = useStore((s) => s.adapter);
  const openTask = useUI((s) => s.openTask);
  const setNewProject = useUI((s) => s.setNewProject);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);

  useEffect(() => {
    if (!adapter || !ws) return;
    void adapter.loadActivity({ workspaceId: ws.id }, 25).then(setActivity).catch(() => setActivity([]));
  }, [adapter, ws]);

  const byProject = tasksByProject(tasks);
  const rows = useMemo(
    () =>
      projects
        .filter((p) => p.status !== "archived")
        .map((p) => {
          const list = byProject[p.id] ?? [];
          const s = suggestHealth(p, list, today);
          const next = list
            .filter((x) => isOpen(x) && !x.parent_id && (x.deadline || x.due_date) && (x.deadline ?? x.due_date)! >= today)
            .sort((a, b) => (a.deadline ?? a.due_date)!.localeCompare((b.deadline ?? b.due_date)!))[0];
          return { p, s, health: effectiveHealth(p, s.health), next };
        })
        .sort((a, b) => ({ off_track: 0, at_risk: 1, on_track: 2 })[a.health] - ({ off_track: 0, at_risk: 1, on_track: 2 })[b.health]),
    [projects, byProject, today],
  );

  const weekEnd = addDays(startOfWeek(today), 6);
  const projectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const deadlines = useMemo(
    () =>
      Object.values(tasks)
        .filter((x) => !x.deleted_at && isOpen(x) && x.project_id && projectIds.has(x.project_id))
        .filter((x) => {
          const d = x.deadline ?? x.due_date;
          return d && d >= today && d <= weekEnd;
        })
        .sort((a, b) => (a.deadline ?? a.due_date)!.localeCompare((b.deadline ?? b.due_date)!))
        .slice(0, 12),
    [tasks, projectIds, today, weekEnd],
  );

  const workload = useMemo(() => {
    const by = assigneesByTask(assignees);
    return members
      .map((m) => {
        const mine = Object.values(tasks).filter((x) => !x.deleted_at && isOpen(x) && x.project_id && projectIds.has(x.project_id) && (by[x.id] ?? []).some((a) => a.user_id === m.id));
        return { m, open: mine.length, overdue: mine.filter((x) => isOverdue(x, today)).length, week: mine.filter((x) => x.due_date && x.due_date <= weekEnd).length };
      })
      .sort((a, b) => b.open - a.open);
  }, [members, tasks, assignees, projectIds, today, weekEnd]);
  const maxOpen = Math.max(1, ...workload.map((w) => w.open));

  const wsGoals = useMemo(() => Object.values(goals).filter((g) => g.workspace_id === ws?.id && !g.deleted_at && g.status === "active"), [goals, ws?.id]);

  return (
    <PageContainer wide>
      <PageHeader
        title={t("overview.title")}
        subtitle={`${ws?.name ?? ""} · ${t("overview.subtitle")}`}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-[var(--pc-indigo-soft)] text-[var(--pc-indigo-fg)]"><LayoutDashboard className="size-5" /></span>}
      />
      {rows.length === 0 ? (
        <EmptyState illustration="folder" title={t("overview.noProjects")} body={t("project.noProjectsBody")} action={<Button onClick={() => setNewProject(true)}>{t("nav.newProject")}</Button>} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          <section className="space-y-3 xl:col-span-2" aria-labelledby="ov-projects">
            <h2 id="ov-projects" className="font-sans text-13 font-semibold tracking-normal text-muted-foreground">{t("overview.projects")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map(({ p, s, health, next }) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}?view=overview`}
                  data-color={p.color}
                  className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-elev-1 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-elev-3"
                >
                  <span className="absolute inset-x-0 top-0 h-1 bg-pc" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      {p.goal && <p className="truncate text-xs text-muted-foreground">{p.goal}</p>}
                    </div>
                    <HealthPill health={health} />
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <p className="font-display text-28 leading-none font-bold tnum">{s.percentDone}%</p>
                    <div className="text-right text-xs text-muted-foreground tnum">
                      <p>{t("overview.openTasks", { count: s.open })}</p>
                      {s.overdue > 0 && <p className="font-semibold text-danger-fg">{t("project.overdueCount", { count: s.overdue })}</p>}
                    </div>
                  </div>
                  <ProgressBar value={s.percentDone} color={p.color} className="mt-2" />
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    {next ? (
                      <span className="truncate">
                        <span className="font-medium text-foreground tnum">{f.dayMonth((next.deadline ?? next.due_date)!)}</span> · {next.title}
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-2xl border bg-card p-4 shadow-elev-1">
              <h2 className="mb-3 flex items-center gap-2 font-sans text-13 font-semibold tracking-normal text-muted-foreground">
                <CalendarClock className="size-4" /> {t("overview.deadlines")}
              </h2>
              {deadlines.length === 0 ? (
                <p className="text-13 text-muted-foreground">{t("overview.deadlinesEmpty")}</p>
              ) : (
                <ul className="space-y-0.5">
                  {deadlines.map((x) => {
                    const p = projects.find((pp) => pp.id === x.project_id);
                    const d = (x.deadline ?? x.due_date)!;
                    return (
                      <li key={x.id}>
                        <button onClick={() => openTask(x.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                          <span className={cn("w-16 shrink-0 text-xs font-semibold tnum", d === today ? "text-brand-fg" : "text-muted-foreground")}>{f.relativeDay(d)}</span>
                          <ProjectDot color={p?.color} size="sm" />
                          <span className="truncate text-13">{x.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-elev-1">
              <h2 className="mb-3 flex items-center gap-2 font-sans text-13 font-semibold tracking-normal text-muted-foreground">
                <Users className="size-4" /> {t("overview.workload")}
              </h2>
              <ul className="space-y-3">
                {workload.map(({ m, open, overdue, week }) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <UserAvatar profile={m} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-13">
                        <span className="truncate font-medium">{m.name}</span>
                        <span className="text-xs text-muted-foreground tnum">
                          {open} · {t("views.dueWeek").toLowerCase()} {week}
                          {overdue > 0 && <span className="ml-1 font-semibold text-danger-fg">· {overdue}</span>}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", open > 12 ? "bg-destructive" : "bg-info")} style={{ width: `${(open / maxOpen) * 100}%` }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/workload" className="mt-3 inline-block text-xs font-medium text-muted-foreground hover:text-foreground">
                {t("nav.workload")} →
              </Link>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-elev-1">
              <h2 className="mb-3 flex items-center gap-2 font-sans text-13 font-semibold tracking-normal text-muted-foreground">
                <Target className="size-4" /> {t("overview.goals")}
              </h2>
              {wsGoals.length === 0 ? (
                <p className="text-13 text-muted-foreground">{t("overview.goalsEmpty")}</p>
              ) : (
                <ul className="space-y-3">
                  {wsGoals.map((g) => {
                    const list = Object.values(krs).filter((k) => k.goal_id === g.id);
                    const pct = list.length
                      ? list.reduce((n, k) => n + Math.max(0, Math.min(1, k.target === k.start_value ? 1 : (k.current - k.start_value) / (k.target - k.start_value))), 0) / list.length * 100
                      : 0;
                    return (
                      <li key={g.id}>
                        <Link href="/goals" className="block">
                          <div className="mb-1 flex justify-between text-13">
                            <span className="truncate">{g.title}</span>
                            <span className="text-muted-foreground tnum">{Math.round(pct)}%</span>
                          </div>
                          <ProgressBar value={pct} color={g.color} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="rounded-2xl border bg-card p-4 shadow-elev-1 xl:col-span-3">
            <h2 className="mb-3 font-sans text-13 font-semibold tracking-normal text-muted-foreground">{t("overview.activity")}</h2>
            <ActivityList entries={activity} />
          </section>
        </div>
      )}
    </PageContainer>
  );
}
