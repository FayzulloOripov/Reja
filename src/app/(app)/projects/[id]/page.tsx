"use client";

import { CalendarDays, FileText, GanttChart, KanbanSquare, LayoutDashboard, List, Table2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { BoardView } from "@/components/projects/board-view";
import { CalendarView } from "@/components/projects/calendar-view";
import { ProjectListView, type Grouping } from "@/components/projects/list-view";
import { NotesTab } from "@/components/projects/notes-tab";
import { OverviewTab } from "@/components/projects/overview-tab";
import { ProjectHeader } from "@/components/projects/project-header";
import { TableView } from "@/components/projects/table-view";
import { TimelineView } from "@/components/projects/timeline-view";
import { PageContainer } from "@/components/shell/app-client";
import { isTyping } from "@/components/shell/shortcuts";
import { FilterBar, saveView } from "@/components/tasks/filter-bar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyFilters } from "@/lib/filters";
import { canWrite } from "@/lib/permissions";
import type { TaskFilters } from "@/lib/types";
import { cn } from "@/lib/utils";
import { assigneesByTask, labelsByTask, tasksByProject, useLabels, useProject, useProjectAccess, useProjectPeople, useSections, useToday, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

const VIEWS = [
  { key: "list", icon: List },
  { key: "board", icon: KanbanSquare },
  { key: "calendar", icon: CalendarDays },
  { key: "timeline", icon: GanttChart },
  { key: "table", icon: Table2 },
  { key: "overview", icon: LayoutDashboard },
  { key: "notes", icon: FileText },
] as const;
type View = (typeof VIEWS)[number]["key"];

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function ProjectPageInner() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const view = (params.get("view") as View) || "list";
  const project = useProject(id);
  const status = useStore((s) => s.status);
  const access = useProjectAccess(project);
  const writable = canWrite(access);
  const sections = useSections(id);
  const people = useProjectPeople(project);
  const labels = useLabels(project?.workspace_id);
  const allTasks = useStore((s) => s.data.tasks);
  const assignees = useStore((s) => s.data.task_assignees);
  const taskLabels = useStore((s) => s.data.task_labels);
  const savedViewsAll = useStore((s) => s.data.saved_views);
  const today = useToday();
  const uid = useUserId();

  const [filters, setFilters] = useState<TaskFilters>({});
  const [grouping, setGrouping] = useState<Grouping>("section");
  const [boardBy, setBoardBy] = useState<"section" | "status">("section");
  useEffect(() => {
    setFilters(readLocal(`reja:filters:${id}`, {}));
    setGrouping(readLocal(`reja:grouping:${id}`, "section"));
    setBoardBy(readLocal(`reja:board:${id}`, "section"));
  }, [id]);
  useEffect(() => {
    try {
      localStorage.setItem(`reja:filters:${id}`, JSON.stringify(filters));
      localStorage.setItem(`reja:grouping:${id}`, JSON.stringify(grouping));
      localStorage.setItem(`reja:board:${id}`, JSON.stringify(boardBy));
    } catch {
      // storage unavailable
    }
  }, [id, filters, grouping, boardBy]);

  const setView = (v: View) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("view", v);
    if (v !== "notes") sp.delete("note");
    router.replace(`?${sp.toString()}`, { scroll: false });
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog][data-state=open]")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VIEWS.length) setView(VIEWS[n - 1].key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tasks = useMemo(() => {
    const list = (tasksByProject(allTasks)[id] ?? []).filter((x) => !x.parent_id);
    return applyFilters(list, view === "calendar" || view === "timeline" ? { ...filters, showDone: true } : filters, {
      today,
      assigneesByTask: assigneesByTask(assignees),
      labelsByTask: labelsByTask(taskLabels),
    });
  }, [allTasks, id, filters, view, today, assignees, taskLabels]);

  const savedViews = useMemo(() => Object.values(savedViewsAll).filter((v) => v.project_id === id), [savedViewsAll, id]);

  if (!project || project.deleted_at) {
    if (status === "loading" || status === "idle" || status === "cached")
      return (
        <PageContainer>
          <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        </PageContainer>
      );
    return (
      <PageContainer>
        <EmptyState illustration="folder" title={t("errors.notFound")} body={t("errors.notFoundBody")} action={<Button onClick={() => router.push("/")}>{t("errors.goHome")}</Button>} />
      </PageContainer>
    );
  }

  const showFilters = view !== "overview" && view !== "notes";

  return (
    <PageContainer wide={view === "board" || view === "timeline" || view === "table" || view === "calendar"}>
      <ProjectHeader project={project} access={access} />
      <nav className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0" aria-label={t("views.list")}>
        {VIEWS.map((v, i) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            aria-current={view === v.key ? "page" : undefined}
            title={`${t(`views.${v.key}`)} (${i + 1})`}
            className={cn(
              "-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-13 font-medium transition-colors",
              view === v.key ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <v.icon className="size-4" />
            {t(`views.${v.key}`)}
          </button>
        ))}
      </nav>
      {showFilters && (
        <FilterBar
          className="mb-4"
          filters={filters}
          onChange={setFilters}
          people={people}
          labels={labels}
          savedViews={savedViews}
          onSave={(name) => saveView({ workspaceId: project.workspace_id, userId: uid, projectId: project.id, name, viewType: view, filters, grouping })}
          extra={
            view === "list" ? (
              <Select value={grouping} onValueChange={(v) => setGrouping(v as Grouping)}>
                <SelectTrigger size="sm" className="h-8 w-auto gap-1 bg-card text-13" aria-label={t("views.groupBy")}>
                  <span className="text-muted-foreground">{t("views.groupBy")}:</span> <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="section">{t("views.groupSection")}</SelectItem>
                  <SelectItem value="status">{t("views.groupStatus")}</SelectItem>
                  <SelectItem value="priority">{t("views.groupPriority")}</SelectItem>
                  <SelectItem value="assignee">{t("views.groupAssignee")}</SelectItem>
                  <SelectItem value="due">{t("views.groupDue")}</SelectItem>
                  <SelectItem value="none">{t("views.groupNone")}</SelectItem>
                </SelectContent>
              </Select>
            ) : view === "board" ? (
              <Select value={boardBy} onValueChange={(v) => setBoardBy(v as "section" | "status")}>
                <SelectTrigger size="sm" className="h-8 w-auto gap-1 bg-card text-13" aria-label={t("views.groupBy")}>
                  <span className="text-muted-foreground">{t("views.groupBy")}:</span> <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="section">{t("views.groupSection")}</SelectItem>
                  <SelectItem value="status">{t("views.groupStatus")}</SelectItem>
                </SelectContent>
              </Select>
            ) : null
          }
        />
      )}
      <div key={view} className="animate-fade-up">
        {view === "list" && <ProjectListView project={project} tasks={tasks} sections={sections} people={people} grouping={grouping} writable={writable} />}
        {view === "board" && <BoardView project={project} tasks={tasks} sections={sections} by={boardBy} writable={writable} />}
        {view === "calendar" && <CalendarView tasks={tasks} writable={writable} projectColor={project.color} />}
        {view === "timeline" && <TimelineView tasks={tasks} sections={sections} writable={writable} color={project.color} />}
        {view === "table" && <TableView project={project} tasks={tasks} sections={sections} people={people} writable={writable} />}
        {view === "overview" && <OverviewTab project={project} tasks={(tasksByProject(allTasks)[id] ?? [])} sections={sections} people={people} writable={writable} />}
        {view === "notes" && <NotesTab project={project} writable={writable} />}
      </div>
    </PageContainer>
  );
}

export default function ProjectPage() {
  return (
    <Suspense>
      <ProjectPageInner />
    </Suspense>
  );
}
