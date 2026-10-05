"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare, MessageSquare, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AvatarStack, DueChip, PriorityIcon, StatusIcon } from "@/components/common/bits";
import { InlineAdd, positionBetween } from "@/components/tasks/task-list";
import { TaskCheckbox } from "@/components/tasks/task-row";
import { byPosition } from "@/lib/filters";
import { isOverdue } from "@/lib/health";
import type { Project, Section, Task, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createSection, moveTasks, toggleComplete, updateTask } from "@/store/actions";
import { assigneesByTask, checklistByTask, commentsByTask, labelsByTask, useToday } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { STATUSES } from "../tasks/pickers";

interface Column {
  key: string;
  title: string;
  tasks: Task[];
  status?: TaskStatus;
  sectionId?: string | null;
}

export function BoardView({ project, tasks, sections, by, writable }: { project: Project; tasks: Task[]; sections: Section[]; by: "section" | "status"; writable: boolean }) {
  const t = useTranslations();
  const [active, setActive] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const columns: Column[] = useMemo(() => {
    if (by === "status") {
      return STATUSES.filter((s) => s !== "cancelled").map((s) => ({ key: s, title: t(`status.${s}`), status: s, tasks: tasks.filter((x) => x.status === s).sort(byPosition) }));
    }
    const loose = tasks.filter((x) => !x.section_id || !sections.some((s) => s.id === x.section_id)).sort(byPosition);
    return [
      ...(loose.length || sections.length === 0 ? [{ key: "none", title: t("project.noSection"), sectionId: null, tasks: loose }] : []),
      ...sections.map((s) => ({ key: s.id, title: s.name, sectionId: s.id, tasks: tasks.filter((x) => x.section_id === s.id).sort(byPosition) })),
    ];
  }, [by, tasks, sections, t]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const task = e.active.data.current?.task as Task | undefined;
    if (!task || !e.over) return;
    const overId = String(e.over.id);
    const col = overId.startsWith("col:") ? columns.find((c) => `col:${c.key}` === overId) : columns.find((c) => c.tasks.some((x) => x.id === overId));
    if (!col) return;
    const list = col.tasks.filter((x) => x.id !== task.id);
    let index = overId.startsWith("col:") ? list.length : list.findIndex((x) => x.id === overId);
    if (index < 0) index = list.length;
    const oldIndex = col.tasks.findIndex((x) => x.id === task.id);
    if (oldIndex >= 0 && oldIndex < index) index += 1;
    const position = positionBetween(list[index - 1]?.position, list[index]?.position);
    if (by === "status") {
      if (col.status === "done" && task.status !== "done") toggleComplete(task);
      else updateTask(task.id, { status: col.status!, position });
    } else {
      if ((col.sectionId ?? null) !== (task.section_id ?? null)) moveTasks([task.id], { projectId: project.id, sectionId: col.sectionId ?? null });
      updateTask(task.id, { position });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e) => setActive((e.active.data.current?.task as Task) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" role="list">
        {columns.map((col) => (
          <BoardColumn key={col.key} column={col} project={project} writable={writable} />
        ))}
        {by === "section" && writable && (
          <div className="w-72 shrink-0">
            {adding ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newName.trim()) createSection(project, newName, (sections.at(-1)?.position ?? 0) + 1);
                  setNewName("");
                  setAdding(false);
                }}
                className="rounded-xl border bg-card p-2"
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => !newName.trim() && setAdding(false)}
                  placeholder={t("project.sectionPlaceholder")}
                  className="h-8 w-full rounded-md bg-muted px-2 text-sm font-semibold outline-none"
                />
              </form>
            ) : (
              <button onClick={() => setAdding(true)} className="flex h-11 w-full items-center gap-2 rounded-xl border border-dashed px-3 text-13 font-medium text-muted-foreground hover:border-brand hover:text-brand-fg">
                <Plus className="size-4" /> {t("project.addSection")}
              </button>
            )}
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.22, 0.8, 0.24, 1)" }}>
        {active ? <BoardCard task={active} lifted /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({ column, project, writable }: { column: Column; project: Project; writable: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.key}` });
  return (
    <section role="listitem" aria-label={column.title} className="flex max-h-[calc(100dvh-15rem)] w-72 shrink-0 flex-col rounded-2xl bg-canvas/80 ring-1 ring-border/60">
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        {column.status ? <StatusIcon status={column.status} /> : <span data-color={project.color} className="size-2 rounded-full bg-pc" />}
        <h3 className="flex-1 truncate font-sans text-13 font-semibold tracking-normal">{column.title}</h3>
        <span className="rounded-full bg-card px-1.5 text-2xs font-semibold text-muted-foreground tnum shadow-elev-1">{column.tasks.length}</span>
      </header>
      <div ref={setNodeRef} className={cn("min-h-16 flex-1 space-y-2 overflow-y-auto px-2 pb-2 transition-colors", isOver && "bg-brand-soft/50")}>
        <SortableContext items={column.tasks.map((x) => x.id)} strategy={verticalListSortingStrategy}>
          {column.tasks.map((task) => (
            <SortableCard key={task.id} task={task} disabled={!writable} />
          ))}
        </SortableContext>
      </div>
      {writable && (
        <div className="px-2 pb-2">
          <InlineAdd defaults={{ projectId: project.id, sectionId: column.sectionId ?? null, status: column.status && column.status !== "done" ? column.status : undefined }} />
        </div>
      )}
    </section>
  );
}

function SortableCard({ task, disabled }: { task: Task; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { task }, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className={cn(isDragging && "opacity-30")}>
      <BoardCard task={task} />
    </div>
  );
}

function BoardCard({ task, lifted }: { task: Task; lifted?: boolean }) {
  const t = useTranslations();
  const today = useToday();
  const openTask = useUI((s) => s.openTask);
  const assignees = useStore((s) => s.data.task_assignees);
  const profiles = useStore((s) => s.data.profiles);
  const checklist = useStore((s) => s.data.checklist_items);
  const comments = useStore((s) => s.data.comments);
  const taskLabels = useStore((s) => s.data.task_labels);
  const labels = useStore((s) => s.data.labels);
  const people = (assigneesByTask(assignees)[task.id] ?? []).map((a) => profiles[a.user_id]).filter(Boolean);
  const items = checklistByTask(checklist)[task.id] ?? [];
  const nComments = commentsByTask(comments)[task.id] ?? 0;
  const tl = (labelsByTask(taskLabels)[task.id] ?? []).map((l) => labels[l.label_id]).filter((l) => l && !l.deleted_at);
  const overdue = isOverdue(task, today);
  return (
    <article
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => e.key === "Enter" && openTask(task.id)}
      tabIndex={0}
      data-task-id={task.id}
      className={cn(
        "group cursor-pointer rounded-xl border bg-card p-3 shadow-elev-1 transition-shadow duration-150 hover:shadow-elev-2 focus-visible:ring-2 focus-visible:ring-ring/40",
        overdue && "border-l-[3px] border-l-destructive",
        lifted && "rotate-[1.5deg] scale-[1.03] shadow-elev-4",
      )}
    >
      {tl.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {tl.map((l) => (
            <span key={l.id} data-color={l.color} className="h-1.5 w-8 rounded-full bg-pc" title={l.name} />
          ))}
        </div>
      )}
      <div className="flex items-start gap-2">
        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
          <TaskCheckbox task={task} onToggle={() => toggleComplete(task)} size={16} />
        </div>
        <p className={cn("flex-1 text-sm leading-snug", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <DueChip date={task.due_date} dueAt={task.due_at} deadline={task.deadline} recurring={Boolean(task.recurrence)} done={task.status === "done"} />
        {items.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tnum">
            <CheckSquare className="size-3" /> {t("common.of", { done: items.filter((i) => i.done).length, total: items.length })}
          </span>
        )}
        {nComments > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tnum">
            <MessageSquare className="size-3" /> {nComments}
          </span>
        )}
        <span className="flex-1" />
        {task.priority !== "none" && <PriorityIcon priority={task.priority} />}
        {people.length > 0 && <AvatarStack people={people} size={20} max={2} />}
      </div>
    </article>
  );
}
