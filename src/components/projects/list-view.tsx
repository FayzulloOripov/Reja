"use client";

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { TaskList, type TaskGroup } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { addDays, startOfWeek } from "@/lib/dates";
import { byDueThenPriority, byPosition } from "@/lib/filters";
import type { Profile, Project, Section, Task, TaskPriority, TaskStatus } from "@/lib/types";
import { createSection, deleteSection, moveTasks, rescheduleTasks, updateSection, updateTask } from "@/store/actions";
import { assigneesByTask, useToday } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { PRIORITIES, STATUSES } from "../tasks/pickers";

export type Grouping = "section" | "status" | "priority" | "assignee" | "due" | "none";

export function ProjectListView({
  project,
  tasks,
  sections,
  people,
  grouping,
  writable,
}: {
  project: Project;
  tasks: Task[];
  sections: Section[];
  people: Profile[];
  grouping: Grouping;
  writable: boolean;
}) {
  const t = useTranslations();
  const today = useToday();
  const assignees = useStore((s) => s.data.task_assignees);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const [newSection, setNewSection] = useState<string | null>(null);

  const groups: TaskGroup[] = useMemo(() => {
    const base = { projectId: project.id };
    switch (grouping) {
      case "section": {
        const out: TaskGroup[] = [];
        const loose = tasks.filter((x) => !x.section_id || !sections.some((s) => s.id === x.section_id)).sort(byPosition);
        if (loose.length || sections.length === 0) out.push({ key: "none", title: sections.length ? t("project.noSection") : undefined, tasks: loose, defaults: { ...base, sectionId: null } });
        for (const s of sections) {
          out.push({
            key: s.id,
            title: <SectionTitle section={s} writable={writable} />,
            tasks: tasks.filter((x) => x.section_id === s.id).sort(byPosition),
            defaults: { ...base, sectionId: s.id },
          });
        }
        return out;
      }
      case "status":
        return STATUSES.map((s: TaskStatus) => ({ key: s, title: t(`status.${s}`), tasks: tasks.filter((x) => x.status === s).sort(byPosition), defaults: { ...base, status: s } })).filter(
          (g) => g.tasks.length || g.key === "todo",
        );
      case "priority":
        return PRIORITIES.map((p: TaskPriority) => ({ key: p, title: t(`priority.${p}`), tasks: tasks.filter((x) => x.priority === p).sort(byDueThenPriority), defaults: { ...base, priority: p } })).filter(
          (g) => g.tasks.length,
        );
      case "assignee": {
        const by = assigneesByTask(assignees);
        const out: TaskGroup[] = people.map((p) => ({
          key: p.id,
          title: p.name,
          tasks: tasks.filter((x) => (by[x.id] ?? []).some((a) => a.user_id === p.id)).sort(byDueThenPriority),
          defaults: { ...base, assigneeIds: [p.id] },
        }));
        out.push({ key: "unassigned", title: t("task.unassigned"), tasks: tasks.filter((x) => !(by[x.id] ?? []).length).sort(byDueThenPriority), defaults: base });
        return out.filter((g) => g.tasks.length);
      }
      case "due": {
        const weekEnd = addDays(startOfWeek(today), 6);
        const buckets: [string, string, (x: Task) => boolean, string | null][] = [
          ["overdue", t("home.overdue"), (x) => Boolean(x.due_date && x.due_date < today), null],
          ["today", t("common.today"), (x) => x.due_date === today, today],
          ["week", t("views.dueWeek"), (x) => Boolean(x.due_date && x.due_date > today && x.due_date <= weekEnd), addDays(today, 1)],
          ["later", t("calendar.next"), (x) => Boolean(x.due_date && x.due_date > weekEnd), null],
          ["none", t("common.noDate"), (x) => !x.due_date, null],
        ];
        return buckets
          .map(([key, title, fn, date]) => ({ key, title, tasks: tasks.filter(fn).sort(byDueThenPriority), defaults: { ...base, dueDate: date }, tone: key === "overdue" ? ("danger" as const) : undefined }))
          .filter((g) => g.tasks.length);
      }
      default:
        return [{ key: "all", tasks: [...tasks].sort(byPosition), defaults: base, collapsible: false }];
    }
  }, [grouping, tasks, sections, project.id, t, writable, assignees, people, today]);

  const sortable = grouping === "section" || grouping === "none" || grouping === "status" || grouping === "priority";

  return (
    <div className="space-y-6">
      <TaskList
        groups={groups}
        sortable={sortable && writable}
        allowAdd={writable}
        readOnly={!writable}
        onMove={(task, group, position) => {
          if (grouping === "section") {
            const sectionId = group.key === "none" ? null : group.key;
            if (sectionId !== task.section_id) moveTasks([task.id], { projectId: project.id, sectionId });
            updateTask(task.id, { position });
          } else if (grouping === "status") {
            updateTask(task.id, { status: group.key as TaskStatus, position });
          } else if (grouping === "priority") {
            updateTask(task.id, { priority: group.key as TaskPriority, position });
          } else if (grouping === "due" && group.defaults?.dueDate) {
            rescheduleTasks([task.id], group.defaults.dueDate);
          } else {
            updateTask(task.id, { position });
          }
        }}
      />
      {tasks.length === 0 && grouping !== "section" && (
        <EmptyState
          illustration="today"
          title={t("project.empty")}
          body={t("project.emptyBody")}
          action={writable && <Button onClick={() => openQuickAdd({ projectId: project.id })}><Plus /> {t("task.addTask")}</Button>}
        />
      )}
      {grouping === "section" && writable && (
        <div className="px-1">
          {newSection !== null ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newSection.trim()) createSection(project, newSection, (sections.at(-1)?.position ?? 0) + 1);
                setNewSection(null);
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                onBlur={() => !newSection.trim() && setNewSection(null)}
                onKeyDown={(e) => e.key === "Escape" && setNewSection(null)}
                placeholder={t("project.sectionPlaceholder")}
                className="h-9 flex-1 rounded-lg border bg-card px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring/30"
              />
              <Button type="submit" size="sm" className="h-9">{t("common.add")}</Button>
            </form>
          ) : (
            <button onClick={() => setNewSection("")} className="flex items-center gap-2 text-13 font-medium text-muted-foreground hover:text-brand-fg">
              <span className="h-px w-6 bg-border" /> <Plus className="size-4" /> {t("project.addSection")} <span className="h-px w-6 bg-border" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ section, writable }: { section: Section; writable: boolean }) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  if (editing) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (name.trim() && name !== section.name) updateSection(section.id, { name: name.trim() });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setName(section.name);
            setEditing(false);
          }
        }}
        className="rounded bg-card px-1 text-13 font-semibold outline-none ring-2 ring-ring/30"
      />
    );
  }
  return (
    <span className="group/sec inline-flex items-center gap-1">
      {section.name}
      {writable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover/sec:opacity-100 focus:opacity-100" aria-label={t("common.more")}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil /> {t("common.rename")}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => deleteSection(section)}><Trash2 /> {t("project.deleteSection")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </span>
  );
}
