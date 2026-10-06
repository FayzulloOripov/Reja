"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ArchiveRestore, FolderKanban, GripVertical, Lock, MoreHorizontal, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { KeyDateChip, PageHeader, ProgressBar, ProjectDot } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { HealthWithReason } from "@/components/projects/project-header";
import { PageContainer } from "@/components/shell/app-client";
import { positionBetween } from "@/components/tasks/task-list";
import { ColorPicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { effectiveHealth, isOpen, suggestHealth, type HealthResult } from "@/lib/health";
import { canManage, canWrite, isFullMember, projectAccess } from "@/lib/permissions";
import { nextKeyDateOf, type KeyDate } from "@/lib/tasks/key-dates";
import { matches } from "@/lib/text";
import type { Area, Project, ProjectHealth, ProjectStatus, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deleteArea, deleteProject, toggleFavorite, updateArea, updateProject } from "@/store/actions";
import { tasksByProject, useAreas, useCurrentWorkspace, useFavorites, useToday, useUserId, useWorkspaceRole } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";

type StatusFilter = "open" | ProjectStatus | "all";
const NO_AREA = "__none__";

interface Row {
  project: Project;
  health: HealthResult & { effective: ProjectHealth };
  next: (KeyDate & { task: Task }) | null;
}

/** All projects, grouped by area: search, filter, progress and health, archive/restore, reorder, favourites. */
export default function ProjectsPage() {
  const t = useTranslations();
  const today = useToday();
  const uid = useUserId();
  const ws = useCurrentWorkspace();
  const role = useWorkspaceRole(ws?.id);
  const areas = useAreas(ws?.id);
  const allProjects = useStore((s) => s.data.projects);
  const tasks = useStore((s) => s.data.tasks);
  const pms = useStore((s) => s.data.project_members);
  const favorites = useFavorites();
  const setNewProject = useUI((s) => s.setNewProject);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<ProjectHealth | "all">("all");

  const rows = useMemo(() => {
    const byProject = tasksByProject(tasks);
    return Object.values(allProjects)
      .filter((p) => !p.deleted_at && p.workspace_id === ws?.id)
      .map((p): Row => {
        const list = byProject[p.id] ?? [];
        const s = suggestHealth(p, list, today);
        return { project: p, health: { ...s, effective: effectiveHealth(p, s.health) }, next: nextKeyDateOf(list.filter((x) => isOpen(x) && !x.parent_id), today) };
      })
      .filter(({ project: p, health }) => {
        if (status === "open" ? p.status === "archived" || p.status === "done" : status !== "all" && p.status !== status) return false;
        if (areaFilter !== "all" && (p.area_id ?? NO_AREA) !== areaFilter) return false;
        if (healthFilter !== "all" && health.effective !== healthFilter) return false;
        return !query.trim() || matches(`${p.name} ${p.goal ?? ""}`, query);
      })
      .sort((a, b) => a.project.position - b.project.position || a.project.name.localeCompare(b.project.name));
  }, [allProjects, tasks, ws?.id, today, status, areaFilter, healthFilter, query]);

  const groups = useMemo(() => {
    const known = new Set(areas.map((a) => a.id));
    const out = areas.map((a) => ({ key: a.id, area: a as Area | null, rows: rows.filter((r) => r.project.area_id === a.id) }));
    out.push({ key: NO_AREA, area: null, rows: rows.filter((r) => !r.project.area_id || !known.has(r.project.area_id)) });
    return out.filter((g) => g.rows.length > 0 || (g.area && areaFilter === "all" && !query.trim() && status === "open" && healthFilter === "all"));
  }, [areas, rows, areaFilter, query, status, healthFilter]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || overId === id) return;
    const group = overId.startsWith("area:") ? groups.find((g) => `area:${g.key}` === overId) : groups.find((g) => g.rows.some((r) => r.project.id === overId));
    if (!group) return;
    const list = group.rows.map((r) => r.project).filter((p) => p.id !== id);
    let index = overId.startsWith("area:") ? list.length : list.findIndex((p) => p.id === overId);
    const from = group.rows.findIndex((r) => r.project.id === id);
    if (from >= 0 && from <= index) index += 1;
    const position = positionBetween(list[index - 1]?.position, list[index]?.position);
    const area_id = group.area?.id ?? null;
    const project = allProjects[id];
    updateProject(id, project && (project.area_id ?? null) !== area_id ? { position, area_id } : { position });
  }

  const total = rows.length;
  const canCreate = isFullMember(role);

  return (
    <PageContainer>
      <PageHeader
        title={t("projects.title")}
        subtitle={t("projects.subtitle", { count: total })}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-[var(--pc-tangerine-soft)] text-[var(--pc-tangerine-fg)]"><FolderKanban className="size-5" /></span>}
        actions={
          canCreate && (
            <Button size="sm" onClick={() => setNewProject(true)}>
              <Plus /> {t("nav.newProject")}
            </Button>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("projects.search")} aria-label={t("projects.search")} className="h-9 bg-card pl-8 sm:w-64" />
        </label>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger size="sm" className="h-9 w-auto bg-card" aria-label={t("common.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{t("projects.statusOpen")}</SelectItem>
            {(["active", "paused", "done", "archived"] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {t(`projectStatus.${s}`)}
              </SelectItem>
            ))}
            <SelectItem value="all">{t("common.all")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger size="sm" className="h-9 w-auto bg-card" aria-label={t("areas.filter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("areas.all")}</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <ProjectDot color={a.color} size="sm" /> {a.name}
              </SelectItem>
            ))}
            <SelectItem value={NO_AREA}>{t("areas.none")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={healthFilter} onValueChange={(v) => setHealthFilter(v as ProjectHealth | "all")}>
          <SelectTrigger size="sm" className="h-9 w-auto bg-card" aria-label={t("health.label")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("projects.anyHealth")}</SelectItem>
            {(["on_track", "at_risk", "off_track"] as const).map((h) => (
              <SelectItem key={h} value={h}>
                {t(`health.${h}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          illustration="folder"
          title={Object.values(allProjects).some((p) => !p.deleted_at && p.workspace_id === ws?.id) ? t("common.noResults") : t("project.noProjects")}
          body={t("project.noProjectsBody")}
          action={canCreate && <Button onClick={() => setNewProject(true)}>{t("nav.newProject")}</Button>}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="space-y-6">
            {groups.map((g) => (
              <AreaGroup key={g.key} id={g.key} area={g.area} count={g.rows.length} canCreate={canCreate}>
                <SortableContext items={g.rows.map((r) => r.project.id)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2">
                    {g.rows.map((r) => {
                      const access = projectAccess(uid, r.project, role, pms[`${r.project.id}|${uid}`]?.role);
                      return <ProjectRow key={r.project.id} row={r} favorite={favorites.some((f) => f.id === r.project.id)} access={access} areas={areas} />;
                    })}
                  </ul>
                </SortableContext>
              </AreaGroup>
            ))}
          </div>
        </DndContext>
      )}
    </PageContainer>
  );
}

function AreaGroup({ id, area, count, canCreate, children }: { id: string; area: Area | null; count: number; canCreate: boolean; children: ReactNode }) {
  const t = useTranslations();
  const setNewProject = useUI((s) => s.setNewProject);
  const { setNodeRef, isOver } = useDroppable({ id: `area:${id}` });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(area?.name ?? "");
  return (
    <section aria-label={area?.name ?? t("areas.none")} className="space-y-2">
      <header className="flex items-center gap-2 px-1">
        {area ? <ProjectDot color={area.color} size="lg" /> : <span className="size-3 rounded-full border border-dashed border-border-strong" aria-hidden />}
        {renaming && area ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) updateArea(area.id, { name: name.trim() });
              setRenaming(false);
            }}
          >
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setRenaming(false)} className="h-8 w-56" aria-label={t("areas.rename")} />
          </form>
        ) : (
          <h2 className="font-sans text-base font-semibold tracking-normal">{area?.name ?? t("areas.none")}</h2>
        )}
        {area?.visibility === "private" && <Lock className="size-3.5 text-muted-foreground" aria-label={t("areas.private")} />}
        <span className="tnum rounded-full bg-muted px-1.5 text-2xs font-semibold text-muted-foreground">{count}</span>
        <span className="h-px flex-1 bg-border" />
        {canCreate && (
          <Button variant="ghost" size="icon-sm" aria-label={t("projects.newInArea", { area: area?.name ?? t("areas.none") })} onClick={() => setNewProject(true, { areaId: area?.id ?? null })}>
            <Plus />
          </Button>
        )}
        {area && canCreate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("projects.areaMenu", { area: area.name })}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem
                onSelect={() => {
                  setName(area.name);
                  setRenaming(true);
                }}
              >
                <Pencil /> {t("areas.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => updateArea(area.id, { visibility: area.visibility === "private" ? "workspace" : "private" })}>
                <Lock /> {area.visibility === "private" ? t("areas.makeShared") : t("areas.makePrivate")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ProjectDot color={area.color} /> {t("common.color")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="p-2">
                  <ColorPicker value={area.color} onChange={(c) => updateArea(area.id, { color: c })} />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("areas.deleteHint")}</DropdownMenuLabel>
              <DropdownMenuItem variant="destructive" onSelect={() => deleteArea(area)}>
                <Trash2 /> {t("areas.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div ref={setNodeRef} className={cn("min-h-12 rounded-2xl transition-colors", isOver && "bg-brand-soft/50 ring-2 ring-brand/30")}>
        {count === 0 ? <p className="flex h-12 items-center justify-center rounded-2xl border border-dashed text-xs text-muted-foreground">{t("projects.dropToArea")}</p> : children}
      </div>
    </section>
  );
}

function ProjectRow({ row, favorite, access, areas }: { row: Row; favorite: boolean; access: ReturnType<typeof projectAccess>; areas: Area[] }) {
  const t = useTranslations();
  const { project: p, health, next } = row;
  const writable = canWrite(access);
  const manager = canManage(access);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id, disabled: !writable });
  const archived = p.status === "archived";
  const [confirm, setConfirm] = useState(false);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-color={p.color}
      className={cn("group relative flex items-start gap-3 rounded-2xl border bg-card p-3 shadow-elev-1 sm:p-4", isDragging && "z-10 shadow-elev-4", archived && "opacity-75")}
    >
      {writable && (
        <button
          {...attributes}
          {...listeners}
          aria-label={t("projects.dragHandle", { name: p.name })}
          className="mt-1 hidden cursor-grab touch-none text-subtle-foreground hover:text-foreground active:cursor-grabbing sm:block"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      )}
      <span className="mt-1 size-3 shrink-0 rounded-full bg-pc" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/projects/${p.id}`} className="min-w-0 font-semibold break-words hover:underline">
            {p.name}
          </Link>
          {p.status !== "active" && <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground">{t(`projectStatus.${p.status}`)}</span>}
          {p.visibility === "private" && <Lock className="size-3.5 text-muted-foreground" aria-label={t("project.visibilityPrivate")} />}
        </div>
        {p.goal && <p className="text-13 text-muted-foreground">{p.goal}</p>}
        <HealthWithReason project={p} result={health} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex w-40 items-center gap-2 tnum">
            <ProgressBar value={health.percentDone} color={p.color} label={t("project.progress")} className="flex-1" />
            {health.percentDone}%
          </span>
          <span className="tnum">{t("project.openCount", { count: health.open })}</span>
          {/* the reason line above already says "1 ta kechikkan" unless the health was set by hand */}
          {health.overdue > 0 && p.health_manual && <span className="font-semibold text-danger-fg tnum">{t("project.overdueCount", { count: health.overdue })}</span>}
          {next && (
            <span className="flex items-center gap-1">
              <KeyDateChip kind={next.kind} date={next.date} /> <span className="max-w-48 truncate" title={next.task.title}>{next.task.title}</span>
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-pressed={favorite} aria-label={favorite ? t("project.unfavorite") : t("project.favorite")} onClick={() => toggleFavorite(p, !favorite)}>
          <Star className={cn(favorite ? "fill-warning text-warning" : "text-muted-foreground")} />
        </Button>
        {writable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("projects.projectMenu", { name: p.name })}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{t("project.area")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {areas.map((a) => (
                    <DropdownMenuItem key={a.id} onSelect={() => updateProject(p.id, { area_id: a.id })}>
                      <ProjectDot color={a.color} /> {a.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onSelect={() => updateProject(p.id, { area_id: null })}>{t("areas.none")}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{t("common.status")}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {(["active", "paused", "done"] as const).map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => updateProject(p.id, { status: s })}>
                      {t(`projectStatus.${s}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => updateProject(p.id, { status: archived ? "active" : "archived" })}>
                {archived ? <ArchiveRestore /> : <Archive />} {archived ? t("project.unarchive") : t("project.archive")}
              </DropdownMenuItem>
              {manager && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                    <Trash2 /> {t("common.delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("project.deleteConfirm", { name: p.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteProject(p)}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
