"use client";

import { CalendarRange } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { TaskList, type TaskGroup } from "@/components/tasks/task-list";
import { addDays, eachDay } from "@/lib/dates";
import { byDueThenPriority } from "@/lib/filters";
import { useFormat } from "@/lib/format";
import { isOpen } from "@/lib/health";
import { rescheduleTasks, updateTask } from "@/store/actions";
import { useMyTasks, useToday, useTz } from "@/store/hooks";

export default function UpcomingPage() {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const mine = useMyTasks();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const open = mine.filter((x) => isOpen(x) && x.due_date).sort(byDueThenPriority);
    const out: TaskGroup[] = [];
    const overdue = open.filter((x) => x.due_date! < today);
    if (overdue.length) out.push({ key: "overdue", title: t("home.overdue"), tasks: overdue, tone: "danger", noAdd: true });
    const days = eachDay(today, addDays(today, 13)).map((d) => ({ d, tasks: open.filter((x) => x.due_date === d) }));
    const dayGroup = (d: string, tasks: typeof open): TaskGroup => ({ key: d, title: f.weekdayDate(d), tasks, defaults: { dueDate: d } });
    // runs of empty days (today always gets its own header) collapse into one compact row
    for (let i = 0; i < days.length; ) {
      const { d, tasks } = days[i];
      if (tasks.length || d === today || expanded[d]) {
        out.push(dayGroup(d, tasks));
        i++;
        continue;
      }
      let j = i;
      while (j < days.length && !days[j].tasks.length && !expanded[days[j].d]) j++;
      const run = days.slice(i, j).map((x) => x.d);
      out.push({
        key: `gap:${run[0]}`,
        tasks: [],
        defaults: { dueDate: run[0] },
        gap: {
          label: (
            <>
              <span className="font-medium">{t("upcoming.emptyDays", { count: run.length })}</span>
              <span className="text-xs">
                · {run.length === 1 ? f.weekdayDate(run[0]) : `${f.dayMonth(run[0])} – ${f.dayMonth(run[run.length - 1])}`}
              </span>
            </>
          ),
          onExpand: () => setExpanded((e) => ({ ...e, ...Object.fromEntries(run.map((x) => [x, true])) })),
        },
      });
      i = j;
    }
    return out;
  }, [mine, today, f, t, expanded]);

  const any = groups.some((g) => g.tasks.length);

  return (
    <PageContainer>
      <PageHeader
        title={t("upcoming.title")}
        subtitle={t("upcoming.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-success-soft text-success-fg"><CalendarRange className="size-5" /></span>}
      />
      <TaskList
        showProject
        sortable
        allowAdd
        groups={groups}
        onMove={(task, group, position) => {
          if (group.key === "overdue") return;
          const date = group.defaults?.dueDate ?? group.key;
          if (task.due_date !== date) rescheduleTasks([task.id], date);
          updateTask(task.id, { position });
        }}
      />
      {!any && <EmptyState illustration="calendar" title={t("upcoming.empty")} compact />}
    </PageContainer>
  );
}
