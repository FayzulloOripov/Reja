"use client";

import { Hourglass } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { PageHeader } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { TaskList, type TaskGroup } from "@/components/tasks/task-list";
import { byDueThenPriority } from "@/lib/filters";
import { responsibleIds } from "@/lib/tasks/responsible";
import { assigneesByTask, useDelegatedTasks, useProfiles } from "@/store/hooks";
import { useStore } from "@/store/store";

/**
 * «Kutilmoqda»: everything you are waiting on. Tasks you created or follow that someone else owns
 * (delegated), grouped by person, with their dates.
 */
export default function WaitingPage() {
  const t = useTranslations();
  const delegated = useDelegatedTasks();
  const assignees = useStore((s) => s.data.task_assignees);
  const profiles = useProfiles();

  const groups: TaskGroup[] = useMemo(() => {
    const by = assigneesByTask(assignees);
    const perPerson = new Map<string, typeof delegated>();
    for (const task of [...delegated].sort(byDueThenPriority)) {
      for (const id of responsibleIds(task, by)) perPerson.set(id, [...(perPerson.get(id) ?? []), task]);
    }
    return [...perPerson.entries()]
      .sort((a, b) => (profiles[a[0]]?.name ?? "").localeCompare(profiles[b[0]]?.name ?? ""))
      .map(([id, tasks]) => ({ key: id, title: profiles[id]?.name ?? t("common.someone"), tasks, noAdd: true }));
  }, [delegated, assignees, profiles, t]);

  return (
    <PageContainer>
      <PageHeader
        title={t("waiting.title")}
        subtitle={t("waiting.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-warning-soft text-warning-fg"><Hourglass className="size-5" /></span>}
      />
      <section aria-labelledby="delegated" className="space-y-2">
        <h2 id="delegated" className="px-1 font-sans text-13 font-semibold tracking-normal text-muted-foreground">
          {t("waiting.delegated")}
        </h2>
        {groups.length === 0 ? (
          <EmptyState compact illustration="team" title={t("waiting.delegatedEmpty")} body={t("waiting.delegatedEmptyBody")} />
        ) : (
          <div className="rounded-2xl border bg-card p-2 shadow-elev-1">
            <TaskList groups={groups} showProject />
          </div>
        )}
      </section>
    </PageContainer>
  );
}
