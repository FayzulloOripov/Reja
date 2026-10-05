"use client";

import { CalendarClock, LayoutDashboard, Target, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { KeyDateChip, PageHeader, ProgressBar, ProjectDot, UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { HealthWithReason } from "@/components/projects/project-header";
import { PageContainer } from "@/components/shell/app-client";
import { ActivityList } from "@/components/tasks/task-detail-sections";
import { Button } from "@/components/ui/button";
import { addDays, startOfWeek } from "@/lib/dates";
import { goalProgress } from "@/lib/goals";
import { effectiveHealth, isOpen, isOverdue, suggestHealth } from "@/lib/health";
import { nextKeyDate, nextKeyDateOf, type KeyDate } from "@/lib/tasks/key-dates";
import type { ActivityEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { assigneesByTask, tasksByProject, useCurrentWorkspace, useMembers, useProjects, useToday } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";

export default function OverviewPage() {
  const t = useTranslations();
  const today = useToday();
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
          const next = nextKeyDateOf(list.filter((x) => isOpen(x) && !x.parent_id), today);
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
        .map((x) => ({ x, k: nextKeyDate(x, today) }))
        .filter((r): r is { x: (typeof r)["x"]; k: KeyDate } => Boolean(r.k && r.k.date <= weekEnd))
        .sort((a, b) => a.k.date.localeCompare(b.k.date))
        .slice(0, 12),
    [tasks, projectIds, today, weekEnd],
  );

  const workload = useMemo(() => {
    const by = assigneesByTask(assignees);
    return members
      .map((m) => {
        const mine = Object.values(tasks).filter((x) => !x.deleted_at && isOpen(x) && x.project_id && projectIds.has(x.project_id) && (by[x.id] ?? []).some((a) => a.user_id === m.id));
        return {
          m,
          open: mine.length,
          overdue: mine.filter((x) => isOverdue(x, today)).length,
          todayCount: mine.filter((x) => x.due_date === today).length,
          week: mine.filter((x) => x.due_date && x.due_date >= today && x.due_date <= weekEnd).length,
        };
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
              {rows.map(({ p, s, next }) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}?view=overview`}
                  data-color={p.color}
                  className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-elev-1 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-elev-3"
                >
                  <span className="absolute inset-x-0 top-0 h-1 bg-pc" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold" title={p.name}>{p.name}</p>
                    {p.goal && <p className="truncate text-xs text-muted-foreground" title={p.goal}>{p.goal}</p>}
                  </div>
                  <HealthWithReason project={p} result={s} className="mt-2" />
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <p className="font-display text-28 leading-none font-bold tnum">{s.percentDone}%</p>
                    <div className="text-right text-xs text-muted-foreground tnum">
                      <p>{t("overview.openTasks", { count: s.open })}</p>
                      {s.overdue > 0 && <p className="font-semibold text-danger-fg">{t("project.overdueCount", { count: s.overdue })}</p>}
                    </div>
                  </div>
                  <ProgressBar value={s.percentDone} color={p.color} className="mt-2" />
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {next ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <KeyDateChip kind={next.kind} date={next.date} />
                        <span className="truncate">· {next.task.title}</span>
                      </span>
                    ) : (
                      <span>{t("overview.noUpcomingDates")}</span>
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
                  {deadlines.map(({ x, k }) => {
                    const p = projects.find((pp) => pp.id === x.project_id);
                    return (
                      <li key={x.id}>
                        <button onClick={() => openTask(x.id)} className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                          <KeyDateChip kind={k.kind} date={k.date} className={cn("w-24 shrink-0 text-xs", k.date === today && k.kind === "due" && "text-brand-fg")} />
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
                {workload.map(({ m, open, overdue, week, todayCount }) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <UserAvatar profile={m} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-13">
                        <span className="truncate font-medium">{m.name}</span>
                        <span className="text-xs text-muted-foreground tnum">
                          {t("overview.loadToday")} {todayCount} · {t("overview.loadWeek")} {week}
                          {overdue > 0 && (
                            <span className="font-semibold text-danger-fg">
                              {" "}· {t("overview.loadOverdue")} {overdue}
                            </span>
                          )}
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
                    const pct = goalProgress(list);
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
