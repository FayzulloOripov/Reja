"use client";

import { CalendarRange } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { PageHeader } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { TaskList, type TaskGroup } from "@/components/tasks/task-list";
import { addDays, eachDay } from "@/lib/dates";
import { byDueThenPriority } from "@/lib/filters";
import { capitalize, useFormat } from "@/lib/format";
import { isOpen } from "@/lib/health";
import { rescheduleTasks, updateTask } from "@/store/actions";
import { useMyTasks, useToday, useTz } from "@/store/hooks";

export default function UpcomingPage() {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const mine = useMyTasks();

  const groups = useMemo(() => {
    const open = mine.filter((x) => isOpen(x) && x.due_date).sort(byDueThenPriority);
    const out: TaskGroup[] = [];
    const overdue = open.filter((x) => x.due_date! < today);
    if (overdue.length) out.push({ key: "overdue", title: t("home.overdue"), tasks: overdue, tone: "danger" });
    for (const d of eachDay(today, addDays(today, 13))) {
      out.push({
        key: d,
        title: `${capitalize(f.relativeDay(d))} · ${f.dayMonth(d)}`,
        tasks: open.filter((x) => x.due_date === d),
        defaults: { dueDate: d },
      });
    }
    return out;
  }, [mine, today, f, t]);

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
          if (task.due_date !== group.key) rescheduleTasks([task.id], group.key);
          updateTask(task.id, { position });
        }}
      />
      {!any && <EmptyState illustration="calendar" title={t("upcoming.empty")} compact />}
    </PageContainer>
  );
}
