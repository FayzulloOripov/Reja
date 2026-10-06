"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ProjectDot } from "@/components/common/bits";
import { addDays } from "@/lib/dates";
import { parseQuickAdd } from "@/lib/parse/quick-add";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createTask, deleteTasks, rescheduleTasks, toggleComplete, type CreateTaskInput } from "@/store/actions";
import { useCurrentWorkspace, useMe, useNowMinutes, useProjects, useToday } from "@/store/hooks";
import { useUI } from "@/store/ui";
import { isTyping } from "../shell/shortcuts";
import { TaskRow } from "./task-row";

export interface TaskGroup {
  key: string;
  title?: ReactNode;
  color?: string | null;
  tasks: Task[];
  /** defaults for tasks created or dropped into this group */
  defaults?: Partial<CreateTaskInput>;
  tone?: "danger";
  collapsible?: boolean;
  /** hide the "add task" row for this group (e.g. overdue) */
  noAdd?: boolean;
  /** a compact placeholder row (e.g. "3 empty days") instead of a header; clicking it calls onExpand */
  gap?: { label: ReactNode; onExpand: () => void };
}

export interface TaskListProps {
  groups: TaskGroup[];
  showProject?: boolean;
  sortable?: boolean;
  readOnly?: boolean;
  allowAdd?: boolean;
  /** called when a task is dropped into a group at a new position */
  onMove?: (task: Task, group: TaskGroup, position: number) => void;
  empty?: ReactNode;
  className?: string;
  triage?: boolean;
  /** make rows draggable with the HTML5 API (e.g. onto the day timeline) */
  nativeDragType?: string;
}

/**
 * Drag previews are position: fixed. Rendered inside the page, an ancestor with a transform (the
 * view's fade-in) becomes their containing block and shifts them — and their collision box — by the
 * page's offset. Rendering them on <body> keeps them under the pointer.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}

/** Position between two neighbours for fractional ordering. */
export function positionBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return Date.now();
  if (before === undefined) return after! - 1024;
  if (after === undefined) return before + 1024;
  return (before + after) / 2;
}

function SortableRow({ task, children }: { task: Task; children: (handle: Record<string, unknown>) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { task } });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-40")}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

function GroupDrop({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("min-h-2 rounded-lg transition-colors", isOver && "bg-brand-soft/60")}>
      {children}
    </div>
  );
}

export function TaskList({ groups, showProject, sortable, readOnly, allowAdd, onMove, empty, className, triage, nativeDragType }: TaskListProps) {
  const t = useTranslations();
  const selection = useUI((s) => s.selection);
  const toggleSelect = useUI((s) => s.toggleSelect);
  const setSelection = useUI((s) => s.setSelection);
  const openTask = useUI((s) => s.openTask);
  const today = useToday();
  const [focusId, setFocusId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const anchor = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const flat = useMemo(() => groups.flatMap((g) => (collapsed[g.key] ? [] : g.tasks)), [groups, collapsed]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const focusTask = useCallback((id: string | null) => {
    setFocusId(id);
    if (id) requestAnimationFrame(() => containerRef.current?.querySelector<HTMLElement>(`[data-task-id="${id}"]`)?.focus());
  }, []);

  const onSelect = useCallback(
    (task: Task, e: React.MouseEvent) => {
      if (e.shiftKey && anchor.current) {
        const a = flat.findIndex((x) => x.id === anchor.current);
        const b = flat.findIndex((x) => x.id === task.id);
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a];
          toggleSelect(task.id, flat.slice(from, to + 1).map((x) => x.id));
          return;
        }
      }
      anchor.current = task.id;
      toggleSelect(task.id);
    },
    [flat, toggleSelect],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const idx = flat.findIndex((x) => x.id === focusId);
    const current = idx >= 0 ? flat[idx] : undefined;
    const targets = selection.length ? selection : current ? [current.id] : [];
    switch (e.key) {
      case "ArrowDown":
      case "j": {
        e.preventDefault();
        const next = flat[Math.min(flat.length - 1, idx + 1)];
        if (next) {
          if (e.shiftKey && current) toggleSelect(next.id, [current.id, next.id]);
          focusTask(next.id);
        }
        break;
      }
      case "ArrowUp":
      case "k": {
        e.preventDefault();
        const prev = flat[Math.max(0, idx - 1)];
        if (prev) {
          if (e.shiftKey && current) toggleSelect(prev.id, [current.id, prev.id]);
          focusTask(prev.id);
        }
        break;
      }
      case "Enter":
        if (current) openTask(current.id);
        break;
      case "x":
        if (current) {
          e.preventDefault();
          toggleSelect(current.id);
        }
        break;
      case "e":
        if (readOnly) break;
        targets.forEach((id) => {
          const task = flat.find((x) => x.id === id);
          if (task) toggleComplete(task, { silent: targets.length > 1 });
        });
        setSelection([]);
        break;
      case "Delete":
      case "Backspace":
        if (readOnly || !targets.length) break;
        e.preventDefault();
        deleteTasks(targets);
        setSelection([]);
        break;
      case "t":
        if (readOnly || !targets.length) break;
        rescheduleTasks(targets, today);
        break;
      case "m":
        if (readOnly || !targets.length) break;
        rescheduleTasks(targets, addDays(today, 1));
        break;
      case "p":
        if (triage && current) {
          e.preventDefault();
          openTask(current.id);
        }
        break;
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveTask((e.active.data.current?.task as Task) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    const task = e.active.data.current?.task as Task | undefined;
    if (!task || !e.over || !onMove) return;
    const overId = String(e.over.id);
    let group: TaskGroup | undefined;
    let index: number;
    if (overId.startsWith("group:")) {
      group = groups.find((g) => `group:${g.key}` === overId);
      index = group ? group.tasks.length : 0;
    } else {
      group = groups.find((g) => g.tasks.some((x) => x.id === overId));
      index = group ? group.tasks.findIndex((x) => x.id === overId) : 0;
    }
    if (!group) return;
    const list = group.tasks.filter((x) => x.id !== task.id);
    const fromSame = group.tasks.some((x) => x.id === task.id);
    const oldIndex = group.tasks.findIndex((x) => x.id === task.id);
    if (fromSame && oldIndex < index) index = Math.min(index, list.length); // moving down
    const position = positionBetween(list[index - 1]?.position, list[index]?.position);
    if (fromSame && oldIndex === group.tasks.findIndex((x) => x.id === overId)) return;
    onMove(task, group, position);
  }

  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  if (total === 0 && !allowAdd && empty) return <>{empty}</>;

  const content = (
    <div
      ref={containerRef}
      role="grid"
      aria-multiselectable
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>("[data-task-id]")?.dataset.taskId;
        if (id && id !== focusId) setFocusId(id);
      }}
      className={cn("space-y-5", className)}
    >
      {groups.map((g) => {
        if (g.gap) return <GapRow key={g.key} group={g} droppable={Boolean(sortable && !readOnly)} />;
        const isCollapsed = collapsed[g.key];
        const rows = (
          <div className="space-y-px">
            {g.tasks.map((task, i) => {
              const props = {
                task,
                showProject,
                readOnly,
                focused: focusId ? focusId === task.id : i === 0 && g === groups.find((x) => x.tasks.length),
                selected: selection.includes(task.id),
                onSelect: (e: React.MouseEvent) => onSelect(task, e),
              };
              return sortable && !readOnly ? (
                <SortableRow key={task.id} task={task}>
                  {(handle) => <TaskRow {...props} dragHandle={handle} />}
                </SortableRow>
              ) : nativeDragType ? (
                <div key={task.id} draggable onDragStart={(e) => e.dataTransfer.setData(nativeDragType, task.id)}>
                  <TaskRow {...props} />
                </div>
              ) : (
                <TaskRow key={task.id} {...props} />
              );
            })}
          </div>
        );
        return (
          <div role="rowgroup" key={g.key} aria-label={typeof g.title === "string" ? g.title : undefined} className="space-y-1">
            {g.title !== undefined && (
              <div role="row" className="flex items-center gap-2 px-2.5 pb-1">
                <div role="columnheader" className="contents">
                {g.collapsible !== false && (
                  <button
                    onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? t("common.expand") : t("common.collapse")}
                    className="-m-2 rounded p-2 text-muted-foreground hover:bg-muted"
                  >
                    <ChevronRight className={cn("size-3.5 transition-transform", !isCollapsed && "rotate-90")} />
                  </button>
                )}
                {g.color && <ProjectDot color={g.color} size="sm" />}
                <h3 className={cn("font-sans text-13 font-semibold tracking-normal", g.tone === "danger" ? "text-danger-fg" : "text-foreground")}>{g.title}</h3>
                <span className="tnum text-xs text-muted-foreground">{g.tasks.length}</span>
                <span className="ml-2 h-px flex-1 bg-border" />
                </div>
              </div>
            )}
            {!isCollapsed &&
              (sortable && !readOnly ? (
                <GroupDrop id={`group:${g.key}`}>
                  <SortableContext items={g.tasks.map((x) => x.id)} strategy={verticalListSortingStrategy}>
                    {rows}
                  </SortableContext>
                </GroupDrop>
              ) : (
                rows
              ))}
            {!isCollapsed && allowAdd && !readOnly && !g.noAdd && (
              <div role="row">
                <div role="gridcell">
                  <InlineAdd defaults={g.defaults} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (!sortable || readOnly) return content;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveTask(null)}>
      {content}
      <BodyPortal>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 0.8, 0.24, 1)" }}>
          {activeTask ? (
            <div role="grid" aria-hidden className="rotate-[0.6deg] scale-[1.02] rounded-lg bg-card shadow-elev-4 ring-1 ring-border">
              <TaskRow task={activeTask} showProject={showProject} />
            </div>
          ) : null}
        </DragOverlay>
      </BodyPortal>
    </DndContext>
  );
}

function GapRow({ group, droppable }: { group: TaskGroup; droppable: boolean }) {
  const button = (
    <button
      onClick={group.gap!.onExpand}
      className="flex min-h-9 w-full items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-left text-13 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
    >
      <ChevronRight className="size-3.5" aria-hidden />
      {group.gap!.label}
    </button>
  );
  const row = (
    <div role="row">
      <div role="gridcell">{button}</div>
    </div>
  );
  return droppable ? <GroupDrop id={`group:${group.key}`}>{row}</GroupDrop> : row;
}

/** "Add task" row that understands the quick-add syntax. */
export function InlineAdd({
  defaults,
  placeholder,
  autoFocus,
  onDone,
  sticky,
}: {
  defaults?: Partial<CreateTaskInput>;
  placeholder?: string;
  autoFocus?: boolean;
  onDone?: () => void;
  /** stay open after each entry (fast entry of subtasks); closes with Escape or the close button */
  sticky?: boolean;
}) {
  const t = useTranslations("task");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(Boolean(autoFocus));
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSubmit = useRef(0);
  const today = useToday();
  const nowMinutes = useNowMinutes();
  const ws = useCurrentWorkspace();
  const projects = useProjects();
  const me = useMe();

  function submit() {
    const text = value.trim();
    if (!text) return;
    const parsed = parseQuickAdd(text, {
      today,
      nowMinutes,
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      workDays: me?.work_days,
    });
    createTask({
      workspaceId: ws?.id,
      ...defaults,
      title: parsed.title || text,
      projectId: parsed.projectId ?? defaults?.projectId ?? null,
      dueDate: parsed.dueDate ?? defaults?.dueDate ?? null,
      dueTime: parsed.dueTime,
      priority: parsed.priority ?? defaults?.priority ?? null,
      recurrence: parsed.recurrence,
      top: parsed.top || defaults?.top,
    });
    setValue("");
    lastSubmit.current = Date.now();
    // phones blur the field on "Enter": put the cursor back for the next entry
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const finish = () => {
    setOpen(false);
    setValue("");
    onDone?.();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="group flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground hover:text-foreground">
        <Plus className="size-[18px] rounded-full text-brand transition-transform group-hover:scale-110" />
        {placeholder ?? t("addTask")}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-2.5 py-1.5 shadow-elev-1">
      <span className="size-[18px] shrink-0 rounded-full border-[1.75px] border-dashed border-border-strong" />
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        enterKeyHint={sticky ? "next" : "done"}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") finish();
        }}
        onBlur={() => {
          if (sticky || value.trim() || Date.now() - lastSubmit.current < 400) return;
          finish();
        }}
        placeholder={placeholder ?? t("titlePlaceholder")}
        aria-label={placeholder ?? t("addTask")}
        className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {sticky && (
        <button type="button" onClick={finish} className="min-h-8 shrink-0 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          {tc("done")}
        </button>
      )}
    </div>
  );
}
