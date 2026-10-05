"use client";

import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { safeColor } from "@/lib/colors";
import { addDays, addMonths, eachDay, isoWeekday, parseISODate, startOfMonth, startOfWeek } from "@/lib/dates";
import { byDueThenPriority } from "@/lib/filters";
import { useFormat } from "@/lib/format";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { rescheduleTasks } from "@/store/actions";
import { useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";

export function CalendarView({ tasks, writable, projectColor }: { tasks: Task[]; writable: boolean; projectColor?: string }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const [mode, setMode] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(today);
  const projects = useStore((s) => s.data.projects);

  const days = useMemo(() => {
    if (mode === "week") return eachDay(startOfWeek(anchor), addDays(startOfWeek(anchor), 6));
    const first = startOfWeek(startOfMonth(anchor));
    const lastOfMonth = addDays(addMonths(startOfMonth(anchor), 1), -1);
    const last = addDays(startOfWeek(lastOfMonth), 6);
    return eachDay(first, last);
  }, [anchor, mode]);

  const byDay = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const task of tasks) if (task.due_date) (m[task.due_date] ??= []).push(task);
    for (const k of Object.keys(m)) m[k].sort(byDueThenPriority);
    return m;
  }, [tasks]);
  const unscheduled = useMemo(() => tasks.filter((x) => !x.due_date && x.status !== "done"), [tasks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const day = e.over?.id ? String(e.over.id) : null;
    if (!day) return;
    rescheduleTasks([id], day === "unscheduled" ? null : day);
  }

  const month = parseISODate(anchor);
  const title = mode === "month" ? `${f.months[month.getUTCMonth()]} ${month.getUTCFullYear()}` : `${f.dayMonth(days[0])} – ${f.dayMonth(days[6])}`;
  const step = (n: number) => setAnchor(mode === "month" ? addMonths(startOfMonth(anchor), n) : addDays(anchor, 7 * n));

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-sans text-base font-semibold tracking-normal capitalize">{title}</h2>
            <Button variant="outline" size="sm" onClick={() => setAnchor(today)} className="bg-card">{t("calendar.today")}</Button>
            <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label={t("calendar.prev")}><ChevronLeft /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label={t("calendar.next")}><ChevronRight /></Button>
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as "month" | "week")} variant="outline" size="sm">
              <ToggleGroupItem value="month">{t("calendar.month")}</ToggleGroupItem>
              <ToggleGroupItem value="week">{t("calendar.week")}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-elev-1">
            <div className="grid grid-cols-7 border-b bg-muted/50">
              {f.weekdaysShort.map((d, i) => (
                <div key={d} className={cn("px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground", i >= 5 && "text-subtle-foreground")}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => (
                <DayCell
                  key={d}
                  day={d}
                  tasks={byDay[d] ?? []}
                  outside={mode === "month" && d.slice(0, 7) !== anchor.slice(0, 7)}
                  isToday={d === today}
                  tall={mode === "week"}
                  writable={writable}
                  colorFor={(task) => projectColor ?? projects[task.project_id ?? ""]?.color}
                  label={f.relativeDay(d)}
                />
              ))}
            </div>
          </div>
        </div>
        <Unscheduled tasks={unscheduled} writable={writable} colorFor={(task) => projectColor ?? projects[task.project_id ?? ""]?.color} />
      </div>
    </DndContext>
  );
}

function DayCell({ day, tasks, outside, isToday, tall, writable, colorFor, label }: { day: string; tasks: Task[]; outside: boolean; isToday: boolean; tall: boolean; writable: boolean; colorFor: (t: Task) => string | undefined; label: string }) {
  const t = useTranslations("calendar");
  const { setNodeRef, isOver } = useDroppable({ id: day, disabled: !writable });
  const max = tall ? 12 : 3;
  const shown = tasks.slice(0, max);
  const weekend = isoWeekday(day) >= 6;
  return (
    <div
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        "border-r border-b p-1.5 transition-colors [&:nth-child(7n)]:border-r-0",
        tall ? "min-h-[22rem]" : "min-h-[6.5rem]",
        outside && "bg-muted/30",
        weekend && !outside && "bg-canvas/40",
        isOver && "bg-brand-soft",
      )}
    >
      <div className="mb-1 flex justify-end">
        <span className={cn("flex size-6 items-center justify-center rounded-full text-xs tnum", isToday ? "bg-primary font-semibold text-primary-foreground" : outside ? "text-subtle-foreground" : "text-muted-foreground")}>
          {Number(day.slice(8))}
        </span>
      </div>
      <div className="space-y-1">
        {shown.map((task) => (
          <Chip key={task.id} task={task} color={colorFor(task)} draggable={writable} />
        ))}
        {tasks.length > max && (
          <Popover>
            <PopoverTrigger className="w-full rounded px-1 text-left text-2xs font-medium text-muted-foreground hover:bg-muted">{t("more", { count: tasks.length - max })}</PopoverTrigger>
            <PopoverContent className="w-64 space-y-1 p-2">
              {tasks.map((task) => (
                <Chip key={task.id} task={task} color={colorFor(task)} draggable={false} />
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

function Chip({ task, color, draggable }: { task: Task; color?: string; draggable: boolean }) {
  const openTask = useUI((s) => s.openTask);
  const tz = useTz();
  const today = useToday();
  const f = useFormat(today, tz);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !draggable });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => openTask(task.id)}
      data-color={safeColor(color)}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded-md border-l-[3px] border-pc bg-pc-soft px-1.5 py-0.5 text-left text-[11.5px] leading-4 text-pc-fg",
        task.status === "done" && "line-through opacity-60",
        isDragging && "shadow-elev-3",
      )}
    >
      {task.due_at && <span className="shrink-0 font-semibold tnum">{f.time(task.due_at)}</span>}
      <span className="truncate">{task.title}</span>
    </button>
  );
}

function Unscheduled({ tasks, writable, colorFor }: { tasks: Task[]; writable: boolean; colorFor: (t: Task) => string | undefined }) {
  const t = useTranslations("calendar");
  const { setNodeRef, isOver } = useDroppable({ id: "unscheduled", disabled: !writable });
  return (
    <aside ref={setNodeRef} className={cn("rounded-2xl border bg-card p-3 shadow-elev-1 lg:w-64", isOver && "bg-brand-soft")}>
      <h3 className="mb-1 font-sans text-13 font-semibold tracking-normal">{t("unscheduled")}</h3>
      <p className="mb-2 text-xs text-muted-foreground">{t("dropHint")}</p>
      <div className="max-h-[28rem] space-y-1 overflow-y-auto">
        {tasks.map((task) => (
          <Chip key={task.id} task={task} color={colorFor(task)} draggable={writable} />
        ))}
      </div>
    </aside>
  );
}
