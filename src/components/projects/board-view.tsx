"use client";

import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare, MessageSquare, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { AvatarStack, DueChip, PriorityIcon, StatusIcon } from "@/components/common/bits";
import { BodyPortal, InlineAdd, positionBetween } from "@/components/tasks/task-list";
import { TaskCheckbox } from "@/components/tasks/task-row";
import { byPosition } from "@/lib/filters";
import { isOverdue } from "@/lib/health";
import type { Project, Section, Task, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createSection, moveCard, toggleComplete } from "@/store/actions";
import { assigneesByTask, checklistByTask, commentsByTask, labelsByTask, useToday } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { STATUSES } from "../tasks/pickers";

/**
 * Keyboard dragging on the board: ↑/↓ move a card within its own column (the default would jump to
 * the nearest card below in any column), ←/→ move it to the next column.
 */
const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { context } = args;
  if ((event.code === "ArrowDown" || event.code === "ArrowUp") && context.active) {
    const containerOf = (id: UniqueIdentifier) => (context.droppableContainers.get(id)?.data.current as { sortable?: { containerId: string } } | undefined)?.sortable?.containerId;
    const containerId = containerOf(context.over?.id ?? context.active.id) ?? containerOf(context.active.id);
    const same = context.droppableContainers.getEnabled().filter((entry) => entry && containerOf(entry.id) === containerId);
    const droppableContainers = { getEnabled: () => same, get: (id: UniqueIdentifier) => context.droppableContainers.get(id) };
    return sortableKeyboardCoordinates(event, { ...args, context: { ...context, droppableContainers } as unknown as typeof context });
  }
  return sortableKeyboardCoordinates(event, args);
};

/** Mouse/touch: closest corners (works with empty columns). Keyboard (no pointer): closest centre, so a picked-up card starts over itself. */
const boardCollision: CollisionDetection = (args) => (args.pointerCoordinates ? closestCorners(args) : closestCenter(args));

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
    // every column stays visible, empty or not, so a card can always be dragged back
    return [
      { key: "none", title: t("project.noSection"), sectionId: null, tasks: loose },
      ...sections.map((s) => ({ key: s.id, title: s.name, sectionId: s.id, tasks: tasks.filter((x) => x.section_id === s.id).sort(byPosition) })),
    ];
  }, [by, tasks, sections, t]);

  // mouse drags after 6px; on touch a long press (250 ms) starts the drag, so swiping scrolls the board
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );
  const scroller = useRef<HTMLDivElement>(null);
  const [visibleCol, setVisibleCol] = useState(0);
  const onScroll = () => {
    const el = scroller.current;
    const first = el?.querySelector<HTMLElement>("[data-board-column]");
    if (!el || !first) return;
    setVisibleCol(Math.min(columns.length - 1, Math.round(el.scrollLeft / (first.offsetWidth + 12))));
  };

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const task = e.active.data.current?.task as Task | undefined;
    if (!task || !e.over) return;
    const overId = String(e.over.id);
    const col = overId.startsWith("col:") ? columns.find((c) => `col:${c.key}` === overId) : columns.find((c) => c.tasks.some((x) => x.id === overId));
    if (!col) return;
    const list = col.tasks.filter((x) => x.id !== task.id);
    let index: number;
    if (overId.startsWith("col:")) index = list.length;
    else {
      // dropping on a card below the card's old place puts it after that card, above it before it
      const overInList = list.findIndex((x) => x.id === overId);
      const oldIndex = col.tasks.findIndex((x) => x.id === task.id);
      const overIndex = col.tasks.findIndex((x) => x.id === overId);
      index = overInList < 0 ? list.length : oldIndex >= 0 && oldIndex < overIndex ? overInList + 1 : overInList;
    }
    const position = positionBetween(list[index - 1]?.position, list[index]?.position);
    if (by === "status") {
      if (col.status === "done" && task.status !== "done") toggleComplete(task);
      else moveCard(task, { status: col.status!, position });
    } else {
      moveCard(task, { section_id: col.sectionId ?? null, position });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollision}
      onDragStart={(e) => setActive((e.active.data.current?.task as Task) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {/* phones: which column is in view */}
      <div className="mb-2 flex items-center justify-between gap-2 md:hidden" aria-hidden>
        <span className="truncate text-13 font-semibold">{columns[visibleCol]?.title}</span>
        <span className="flex items-center gap-1.5">
          {columns.map((c, i) => (
            <span key={c.key} className={cn("size-1.5 rounded-full transition-colors", i === visibleCol ? "bg-brand" : "bg-border-strong")} />
          ))}
          <span className="ml-1 text-xs font-medium text-muted-foreground tnum">
            {visibleCol + 1}/{columns.length}
          </span>
        </span>
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 md:snap-none lg:-mx-10 lg:px-10"
        role="list"
      >
        {columns.map((col) => (
          <BoardColumn key={col.key} column={col} project={project} writable={writable} />
        ))}
        {by === "section" && writable && (
          <div className="w-[85vw] shrink-0 snap-start sm:w-72">
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
      <BodyPortal>
        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.22, 0.8, 0.24, 1)" }}>
          {active ? <BoardCard task={active} lifted /> : null}
        </DragOverlay>
      </BodyPortal>
    </DndContext>
  );
}

function BoardColumn({ column, project, writable }: { column: Column; project: Project; writable: boolean }) {
  const t = useTranslations();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.key}` });
  return (
    <section
      role="listitem"
      aria-label={column.title}
      data-board-column
      className="flex max-h-[calc(100dvh-15rem)] w-[85vw] shrink-0 snap-start flex-col rounded-2xl bg-canvas/80 ring-1 ring-border/60 sm:w-72"
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        {column.status ? <StatusIcon status={column.status} /> : <span data-color={project.color} className="size-2 rounded-full bg-pc" />}
        <h3 className="flex-1 truncate font-sans text-13 font-semibold tracking-normal">{column.title}</h3>
        <span className="rounded-full bg-card px-1.5 text-2xs font-semibold text-muted-foreground tnum shadow-elev-1">{column.tasks.length}</span>
      </header>
      <div ref={setNodeRef} className={cn("min-h-24 flex-1 space-y-2 overflow-y-auto rounded-xl px-2 pb-2 transition-colors", isOver && "bg-brand-soft/50")}>
        {column.tasks.length === 0 && (
          <p className="flex h-20 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">{t("project.dropHere")}</p>
        )}
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
