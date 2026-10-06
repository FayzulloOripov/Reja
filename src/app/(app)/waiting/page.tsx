"use client";

import { Building2, Hourglass } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { PageHeader, UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { TaskList, type TaskGroup } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { byDueThenPriority } from "@/lib/filters";
import { followUpDue, waitingOn, waitingTasks } from "@/lib/org";
import { responsibleIds } from "@/lib/tasks/responsible";
import { assigneesByTask, liveTasks, useDelegatedTasks, useProfiles, useToday } from "@/store/hooks";
import { useStore } from "@/store/store";

/**
 * «Kutilmoqda»: everything you are waiting on.
 *   • «Men kutayotganlar» — tasks marked as waiting on a teammate or an outside contact, grouped by
 *     who, with how long and when to chase;
 *   • «Boshqalardan kutilayotgan» — tasks you created or follow that someone else owns (delegated).
 */
export default function WaitingPage() {
  const t = useTranslations();
  const today = useToday();
  const delegated = useDelegatedTasks();
  const assignees = useStore((s) => s.data.task_assignees);
  const tasks = useStore((s) => s.data.tasks);
  const contacts = useStore((s) => s.data.contacts);
  const uid = useStore((s) => s.userId);
  const profiles = useProfiles();

  const waitingGroups: TaskGroup[] = useMemo(() => {
    const by = assigneesByTask(assignees);
    // mine: I own it (assignee, else creator)
    const mine = waitingTasks(liveTasks(tasks)).filter((task) => responsibleIds(task, by).includes(uid ?? ""));
    const groups = new Map<string, { title: React.ReactNode; sort: string; tasks: typeof mine; chase: number }>();
    for (const task of mine) {
      const on = waitingOn(task)!;
      const key = `${on.kind}:${on.id}`;
      if (!groups.has(key)) {
        const contact = on.kind === "contact" ? contacts[on.id] : undefined;
        const person = on.kind === "user" ? profiles[on.id] : undefined;
        const name = contact?.name ?? person?.name ?? t("common.someone");
        groups.set(key, {
          sort: name,
          chase: 0,
          tasks: [],
          title: (
            <span className="inline-flex items-center gap-1.5">
              {contact ? <Building2 className="size-3.5" /> : <UserAvatar profile={person} size={18} />}
              {name}
              {contact?.company && <span className="font-normal text-muted-foreground">· {contact.company}</span>}
            </span>
          ),
        });
      }
      const g = groups.get(key)!;
      g.tasks.push(task);
      if (followUpDue(task, today)) g.chase++;
    }
    return [...groups.entries()]
      .sort((a, b) => b[1].chase - a[1].chase || a[1].sort.localeCompare(b[1].sort))
      .map(([key, g]) => ({ key, title: g.title, tasks: g.tasks, noAdd: true }));
  }, [tasks, assignees, contacts, profiles, uid, today, t]);

  const chaseCount = waitingGroups.reduce((n, g) => n + g.tasks.filter((x) => followUpDue(x, today)).length, 0);

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
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/contacts">
              <Building2 /> {t("contacts.title")}
            </Link>
          </Button>
        }
      />
      <section aria-labelledby="mine-waiting" className="mb-6 space-y-2">
        <h2 id="mine-waiting" className="flex items-center gap-2 px-1 font-sans text-13 font-semibold tracking-normal text-muted-foreground">
          {t("waiting.mine")}
          {chaseCount > 0 && <span className="rounded-full bg-warning-soft px-2 py-px text-2xs font-semibold text-warning-fg">{t("waiting.chaseCount", { count: chaseCount })}</span>}
        </h2>
        {waitingGroups.length === 0 ? (
          <EmptyState compact illustration="team" title={t("waiting.mineEmpty")} body={t("waiting.mineEmptyBody")} />
        ) : (
          <div className="rounded-2xl border bg-card p-2 shadow-elev-1">
            <TaskList groups={waitingGroups} showProject />
          </div>
        )}
      </section>
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
