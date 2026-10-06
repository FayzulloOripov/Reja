"use client";

import { AlarmClock, CheckCircle2, CircleDot, ListTodo, Milestone, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef } from "react";
import { KeyDateChip, ProgressBar, UserAvatar } from "@/components/common/bits";
import { RichEditor } from "@/components/editor/rich-editor";
import { ActivityList } from "@/components/tasks/task-detail-sections";
import { diffDays } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import { isOpen, isOverdue } from "@/lib/health";
import { nextKeyDate, type KeyDate } from "@/lib/tasks/key-dates";
import type { Profile, Project, Section, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { updateProject } from "@/store/actions";
import { assigneesByTask, useActivity, useProjectHealth, useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { HealthWithReason } from "./project-header";

function Card({ title, icon, children, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 shadow-elev-1", className)}>
      <h3 className="mb-3 flex items-center gap-2 font-sans text-13 font-semibold tracking-normal text-muted-foreground [&_svg]:size-4">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function OverviewTab({ project, tasks, sections, people, writable }: { project: Project; tasks: Task[]; sections: Section[]; people: Profile[]; writable: boolean }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const health = useProjectHealth(project);
  const openTask = useUI((s) => s.openTask);
  const assignees = useStore((s) => s.data.task_assignees);
  const goals = useStore((s) => s.data.goals);
  const krs = useStore((s) => s.data.key_results);
  const activity = useActivity({ projectId: project.id }, 15);
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const top = useMemo(() => tasks.filter((x) => !x.parent_id && x.status !== "cancelled"), [tasks]);
  const bySection = useMemo(
    () =>
      [{ id: null as string | null, name: t("project.noSection") }, ...sections.map((s) => ({ id: s.id as string | null, name: s.name }))]
        .map((s) => {
          const list = top.filter((x) => (x.section_id ?? null) === s.id);
          return { ...s, total: list.length, done: list.filter((x) => x.status === "done").length };
        })
        .filter((s) => s.total > 0),
    [top, sections, t],
  );
  const workload = useMemo(() => {
    const by = assigneesByTask(assignees);
    return people
      .map((p) => {
        const mine = top.filter((x) => isOpen(x) && (by[x.id] ?? []).some((a) => a.user_id === p.id));
        return { p, open: mine.length, overdue: mine.filter((x) => isOverdue(x, today)).length };
      })
      .filter((r) => r.open > 0)
      .sort((a, b) => b.open - a.open);
  }, [assignees, people, top, today]);
  const milestones = useMemo(
    () =>
      top
        .filter(isOpen)
        .map((x) => ({ x, k: nextKeyDate(x, today) }))
        .filter((r): r is { x: (typeof r)["x"]; k: KeyDate } => r.k !== null)
        .sort((a, b) => a.k.date.localeCompare(b.k.date))
        .slice(0, 6),
    [top, today],
  );
  const projectGoals = useMemo(() => Object.values(goals).filter((g) => g.project_id === project.id && !g.deleted_at), [goals, project.id]);
  const maxLoad = Math.max(1, ...workload.map((w) => w.open));

  if (!health) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <section className="rounded-2xl border bg-card p-5 shadow-elev-1">
          <div className="flex flex-wrap items-center gap-3">
            <HealthWithReason project={project} result={health} />
            {project.target_date && (
              <span className="ml-auto text-13 text-muted-foreground tnum">
                <Milestone className="mr-1 inline size-3.5" aria-hidden />
                {f.dayMonth(project.target_date)} · {diffDays(today, project.target_date) >= 0 ? t("time.inDays", { count: diffDays(today, project.target_date) }) : t("health.reasonPassed")}
              </span>
            )}
          </div>
          {project.goal && (
            <p className="mt-4 flex items-start gap-2 text-[15px] font-medium">
              <Target className="mt-0.5 size-4 shrink-0 text-brand" /> {project.goal}
            </p>
          )}
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: t("project.progress"), value: `${health.percentDone}%`, icon: <CheckCircle2 className="text-success" /> },
              { label: t("project.openCount", { count: "" }).trim() || t("status.todo"), value: health.open, icon: <ListTodo className="text-info" /> },
              { label: t("home.overdue"), value: health.overdue, icon: <AlarmClock className={health.overdue ? "text-destructive" : "text-muted-foreground"} /> },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-muted/50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
                  {s.icon} {s.label}
                </div>
                <p className="mt-1 font-display text-28 leading-none font-bold tnum">{s.value}</p>
              </div>
            ))}
          </div>
          <ProgressBar value={health.percentDone} color={project.color} className="mt-4 h-2" label={t("project.progress")} />
        </section>

        <Card title={t("common.description")}>
          <RichEditor
            value={project.description}
            editable={writable}
            toolbar
            placeholder={t("task.descriptionPlaceholder")}
            onChange={(doc) => {
              if (descTimer.current) clearTimeout(descTimer.current);
              descTimer.current = setTimeout(() => updateProject(project.id, { description: doc }), 700);
            }}
          />
        </Card>

        {bySection.length > 0 && (
          <Card title={t("project.progress")} icon={<CircleDot />}>
            <ul className="space-y-3">
              {bySection.map((s) => (
                <li key={s.id ?? "none"}>
                  <div className="mb-1 flex justify-between text-13">
                    <span>{s.name}</span>
                    <span className="text-muted-foreground tnum">{t("common.of", { done: s.done, total: s.total })}</span>
                  </div>
                  <ProgressBar value={(s.done / s.total) * 100} color={project.color} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title={t("overview.activity")}>
          <ActivityList entries={activity} />
        </Card>
      </div>

      <div className="space-y-4">
        <Card title={t("project.nextDeadline")} icon={<Milestone />}>
          {milestones.length === 0 ? (
            <p className="text-13 text-muted-foreground">{t("overview.deadlinesEmpty")}</p>
          ) : (
            <ul className="space-y-1">
              {milestones.map(({ x: m, k }) => (
                <li key={m.id}>
                  <button onClick={() => openTask(m.id)} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-13 hover:bg-muted">
                    <KeyDateChip kind={k.kind} date={k.date} className="w-24 shrink-0 text-xs" />
                    <span className="truncate">{m.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("overview.workload")}>
          {workload.length === 0 ? (
            <p className="text-13 text-muted-foreground">{t("workload.empty")}</p>
          ) : (
            <ul className="space-y-2.5">
              {workload.map((w) => (
                <li key={w.p.id} className="flex items-center gap-2.5">
                  <UserAvatar profile={w.p} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-13">
                      <span className="truncate">{w.p.name}</span>
                      <span className="text-muted-foreground tnum">
                        {w.open}
                        {w.overdue > 0 && <span className="ml-1 text-danger-fg">· {w.overdue}</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-info" style={{ width: `${(w.open / maxLoad) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("goals.keyResults")} icon={<Target />}>
          {projectGoals.length === 0 ? (
            <p className="text-13 text-muted-foreground">{t("overview.goalsEmpty")}</p>
          ) : (
            <ul className="space-y-4">
              {projectGoals.map((g) => (
                <li key={g.id} className="space-y-2">
                  <p className="text-13 font-semibold">{g.title}</p>
                  {Object.values(krs)
                    .filter((k) => k.goal_id === g.id)
                    .map((k) => {
                      const pct = k.target === k.start_value ? 100 : ((k.current - k.start_value) / (k.target - k.start_value)) * 100;
                      return (
                        <div key={k.id}>
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="truncate text-muted-foreground">{k.title}</span>
                            <span className="tnum">
                              {k.current}/{k.target} {k.unit}
                            </span>
                          </div>
                          <ProgressBar value={pct} color={g.color} />
                        </div>
                      );
                    })}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
