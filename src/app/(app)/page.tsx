"use client";

import { ArrowRight, CalendarCheck2, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { ProjectDot, Section } from "@/components/common/bits";
import { EmptyState, Illustration } from "@/components/common/empty-state";
import { DayTimeline, TASK_DRAG_TYPE } from "@/components/home/day-timeline";
import { HabitsRow, PlanTomorrow, StatsCards } from "@/components/home/widgets";
import { PageContainer } from "@/components/shell/app-client";
import { InlineAdd, TaskList, type TaskGroup } from "@/components/tasks/task-list";
import { TaskRow } from "@/components/tasks/task-row";
import { Button } from "@/components/ui/button";
import { addDays, dateIn, eachDay, partOfDay } from "@/lib/dates";
import { byDueThenPriority } from "@/lib/filters";
import { capitalize, useFormat } from "@/lib/format";
import { isOpen } from "@/lib/health";
import { rescheduleTasks } from "@/store/actions";
import { useMe, useMyTasks, useNowMinutes, useProjects, useToday, useTz } from "@/store/hooks";
import { useUI } from "@/store/ui";

export default function HomePage() {
  const t = useTranslations();
  const me = useMe();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const now = useNowMinutes();
  const mine = useMyTasks();
  const projects = useProjects(undefined, { includeArchived: true });
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  const completedToday = useMemo(
    () =>
      mine
        .filter((x) => x.status === "done" && x.completed_at && dateIn(tz, x.completed_at) === today)
        .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")),
    [mine, tz, today],
  );

  const { top, todayTasks, overdue, upcoming, doneToday, plannedToday } = useMemo(() => {
    const top = mine.filter((x) => x.top_date === today && x.status !== "cancelled").sort(byDueThenPriority);
    const topIds = new Set(top.map((x) => x.id));
    const todayAll = mine.filter((x) => x.due_date === today && x.status !== "cancelled");
    const todayTasks = todayAll.filter((x) => isOpen(x) && !topIds.has(x.id)).sort(byDueThenPriority);
    const overdue = mine.filter((x) => isOpen(x) && x.due_date && x.due_date < today && !topIds.has(x.id)).sort(byDueThenPriority);
    const upcoming = mine.filter((x) => isOpen(x) && x.due_date && x.due_date > today && x.due_date <= addDays(today, 7)).sort(byDueThenPriority);
    const planned = new Map<string, boolean>();
    for (const x of [...top, ...todayAll]) planned.set(x.id, x.status === "done");
    const doneToday = [...planned.values()].filter(Boolean).length;
    return { top, todayTasks, overdue, upcoming, doneToday, plannedToday: planned.size };
  }, [mine, today]);

  const todayGroups: TaskGroup[] = useMemo(() => {
    const by = new Map<string, typeof todayTasks>();
    for (const x of todayTasks) by.set(x.project_id ?? "", [...(by.get(x.project_id ?? "") ?? []), x]);
    return [...by.entries()].map(([pid, list]) => ({
      key: pid || "inbox",
      title: pid ? (projectById[pid]?.name ?? "…") : t("home.noProject"),
      color: pid ? projectById[pid]?.color : null,
      tasks: list,
      defaults: { projectId: pid || null, dueDate: today },
    }));
  }, [todayTasks, projectById, t, today]);

  const upcomingGroups: TaskGroup[] = useMemo(
    () =>
      eachDay(addDays(today, 1), addDays(today, 7))
        .map((d) => ({ key: d, title: `${capitalize(f.relativeDay(d))} · ${f.dayMonth(d)}`, tasks: upcoming.filter((x) => x.due_date === d), defaults: { dueDate: d } }))
        .filter((g) => g.tasks.length),
    [upcoming, today, f],
  );

  const percent = plannedToday ? Math.round((doneToday / plannedToday) * 100) : 0;
  const firstName = (me?.name ?? "").split(" ")[0];
  const timelineCandidates = useMemo(() => [...top, ...todayTasks, ...overdue].filter(isOpen), [top, todayTasks, overdue]);

  return (
    <PageContainer wide>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-8">
          <header className="space-y-2">
            <p className="text-13 font-medium text-brand-fg">{f.longDay(today)}</p>
            <h1 className="text-28 font-bold sm:text-36">{t(`greeting.${partOfDay(Math.floor(now / 60))}`, { name: firstName || "👋" })}</h1>
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">{plannedToday ? t("home.subtitleDone", { percent }) : t("home.subtitleEmpty")}</p>
              {plannedToday > 0 && (
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${percent}%` }} />
                </div>
              )}
            </div>
          </header>

          {/* top 3 */}
          <section aria-labelledby="top3" className="relative overflow-hidden rounded-3xl border bg-[linear-gradient(150deg,var(--brand-soft),var(--card)_55%)] p-4 shadow-elev-2 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="top3" className="flex items-center gap-2 font-sans text-base font-semibold tracking-normal">
                <Star className="size-4 fill-warning text-warning" /> {t("home.top3")}
              </h2>
              <span className="text-xs text-muted-foreground tnum">{top.filter((x) => x.status === "done").length}/{Math.max(3, top.length)}</span>
            </div>
            {top.length === 0 ? (
              <div className="flex items-center gap-4 rounded-2xl border border-dashed bg-card/60 p-4">
                <Sparkles className="size-6 shrink-0 text-brand" />
                <div className="text-13">
                  <p className="font-medium">{t("home.top3Hint")}</p>
                  <p className="text-muted-foreground">{t("home.top3Empty")}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {top.map((x) => (
                  <div key={x.id} draggable onDragStart={(e) => e.dataTransfer.setData(TASK_DRAG_TYPE, x.id)} className="rounded-xl bg-card/80 shadow-elev-1">
                    <TaskRow task={x} showProject />
                  </div>
                ))}
                {top.length > 3 && <p className="px-2 pt-1 text-xs text-warning-fg">{t("home.top3Full")}</p>}
              </div>
            )}
          </section>

          {plannedToday > 0 && doneToday === plannedToday && overdue.length === 0 && (
            <div className="flex items-center gap-4 rounded-2xl border bg-success-soft p-4">
              <Illustration name="done" className="hidden sm:flex [&_svg]:h-16" />
              <p className="font-medium text-success-fg">{t("home.allClear")}</p>
            </div>
          )}

          {overdue.length > 0 && (
            <Section
              title={t("home.overdue")}
              count={overdue.length}
              tone="danger"
              actions={
                <Button variant="ghost" size="xs" className="text-danger-fg" onClick={() => rescheduleTasks(overdue.map((x) => x.id), today)}>
                  <CalendarCheck2 /> {t("home.rescheduleAll")}
                </Button>
              }
            >
              <div className="rounded-2xl border border-destructive/25 bg-danger-soft/40 p-1.5">
                <div className="space-y-px">
                  {overdue.map((x) => (
                    <div key={x.id} draggable onDragStart={(e) => e.dataTransfer.setData(TASK_DRAG_TYPE, x.id)}>
                      <TaskRow task={x} showProject />
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          <Section title={t("home.today")} count={todayTasks.length}>
            {todayGroups.length === 0 ? (
              <EmptyState
                compact
                illustration="today"
                title={t("home.todayEmpty")}
                action={<Button size="sm" variant="outline" onClick={() => openQuickAdd({ dueDate: today })}>{t("task.addTask")}</Button>}
              />
            ) : (
              <div className="rounded-2xl border bg-card p-1.5 shadow-elev-1">
                <TaskList groups={todayGroups} nativeDragType={TASK_DRAG_TYPE} />
                {/* one add row for the whole section, not one per project group */}
                <InlineAdd defaults={{ dueDate: today }} />
              </div>
            )}
          </Section>

          <Section
            title={t("home.upcoming")}
            count={upcoming.length}
            actions={
              <Link href="/upcoming" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                {t("nav.upcoming")} <ArrowRight className="size-3" />
              </Link>
            }
          >
            {upcomingGroups.length === 0 ? (
              <p className="px-1 text-13 text-muted-foreground">{t("home.upcomingEmpty")}</p>
            ) : (
              <TaskList groups={upcomingGroups} showProject />
            )}
          </Section>

          {completedToday.length > 0 && (
            <Section title={t("home.completedToday")} count={completedToday.length}>
              <p className="px-1 text-xs text-muted-foreground">{t("home.completedTodayHint")}</p>
              <TaskList groups={[{ key: "done-today", tasks: completedToday }]} showProject />
            </Section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <PlanTomorrow evening={now >= 17 * 60} />
          <Section title={t("home.habits")}>
            <HabitsRow />
          </Section>
          <StatsCards />
          <Section title={t("home.timeline")} actions={<span className="hidden text-2xs text-muted-foreground lg:inline">{t("home.timelineHint")}</span>}>
            <div className="max-h-[560px] overflow-y-auto rounded-2xl border bg-card p-3 pt-4 shadow-elev-1">
              <DayTimeline date={today} candidates={timelineCandidates} />
            </div>
          </Section>
          {projects.length === 0 && (
            <div className="rounded-2xl border border-dashed p-4 text-13 text-muted-foreground">
              <ProjectDot color="tangerine" className="mr-2" />
              {t("project.noProjectsBody")}
            </div>
          )}
        </aside>
      </div>
    </PageContainer>
  );
}
