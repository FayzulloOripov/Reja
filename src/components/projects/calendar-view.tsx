"use client";

import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Milestone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { safeColor } from "@/lib/colors";
import { addDays, addMonths, eachDay, isoWeekday, parseISODate, startOfMonth, startOfWeek } from "@/lib/dates";
import { byDueThenPriority } from "@/lib/filters";
import { capitalize, useFormat } from "@/lib/format";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { rescheduleTasks } from "@/store/actions";
import { useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";

type Mode = "agenda" | "3day" | "week" | "month";

/** Phones open in the agenda (list by day); larger screens in the month grid. */
function defaultMode(): Mode {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "agenda" : "month";
}

export function CalendarView({
  tasks,
  writable,
  projectColor,
  projectDeadline,
}: {
  tasks: Task[];
  writable: boolean;
  projectColor?: string;
  /** the project's target date, shown as a marker */
  projectDeadline?: { date: string; name: string } | null;
}) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [anchor, setAnchor] = useState(today);
  const projects = useStore((s) => s.data.projects);

  const days = useMemo(() => {
    if (mode === "agenda") return eachDay(anchor, addDays(anchor, 13));
    if (mode === "3day") return eachDay(anchor, addDays(anchor, 2));
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
  // hard deadlines (and the project's target date) are shown as flags on their day
  const deadlinesByDay = useMemo(() => {
    const m: Record<string, { id: string; title: string; taskId?: string }[]> = {};
    for (const task of tasks) if (task.deadline && task.status !== "done") (m[task.deadline] ??= []).push({ id: task.id, title: task.title, taskId: task.id });
    if (projectDeadline) (m[projectDeadline.date] ??= []).unshift({ id: "project", title: t("calendar.projectDeadline", { name: projectDeadline.name }) });
    return m;
  }, [tasks, projectDeadline, t]);
  const unscheduled = useMemo(() => tasks.filter((x) => !x.due_date && x.status !== "done"), [tasks]);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }));

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const day = e.over?.id ? String(e.over.id) : null;
    if (!day) return;
    rescheduleTasks([id], day === "unscheduled" ? null : day);
  }

  const month = parseISODate(anchor);
  const title = mode === "month" ? `${f.months[month.getUTCMonth()]} ${month.getUTCFullYear()}` : `${f.dayMonth(days[0])} – ${f.dayMonth(days[days.length - 1])}`;
  const step = (n: number) =>
    setAnchor(mode === "month" ? addMonths(startOfMonth(anchor), n) : addDays(anchor, n * (mode === "3day" ? 3 : mode === "agenda" ? 14 : 7)));
  const colorFor = (task: Task) => projectColor ?? projects[task.project_id ?? ""]?.color;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-sans text-base font-semibold tracking-normal">{capitalize(title)}</h2>
            <Button variant="outline" size="sm" onClick={() => setAnchor(today)} className="bg-card">{t("calendar.today")}</Button>
            <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label={t("calendar.prev")}><ChevronLeft /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label={t("calendar.next")}><ChevronRight /></Button>
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as Mode)} variant="outline" size="sm" aria-label={t("calendar.view")}>
              <ToggleGroupItem value="agenda">{t("calendar.agenda")}</ToggleGroupItem>
              <ToggleGroupItem value="3day">{t("calendar.threeDays")}</ToggleGroupItem>
              <ToggleGroupItem value="week" className="hidden sm:flex">{t("calendar.week")}</ToggleGroupItem>
              <ToggleGroupItem value="month">{t("calendar.month")}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {mode === "agenda" ? (
            <Agenda days={days} byDay={byDay} deadlines={deadlinesByDay} today={today} writable={writable} colorFor={colorFor} />
          ) : mode === "3day" ? (
            <div className="grid grid-cols-3 overflow-hidden rounded-2xl border bg-card shadow-elev-1">
              {days.map((d) => (
                <div key={d} className="border-r last:border-r-0">
                  <p className={cn("border-b bg-muted/50 px-2 py-1.5 text-center text-xs font-semibold", d === today ? "text-brand-fg" : "text-muted-foreground")}>{f.relativeDay(d)}</p>
                  <DayCell day={d} tasks={byDay[d] ?? []} deadlines={deadlinesByDay[d]} outside={false} isToday={d === today} tall writable={writable} colorFor={colorFor} label={f.weekdayDate(d)} wrap />
                </div>
              ))}
            </div>
          ) : (
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
                  deadlines={deadlinesByDay[d]}
                  outside={mode === "month" && d.slice(0, 7) !== anchor.slice(0, 7)}
                  isToday={d === today}
                  tall={mode === "week"}
                  writable={writable}
                  colorFor={colorFor}
                  label={f.weekdayDate(d)}
                />
              ))}
            </div>
          </div>
          )}
        </div>
        <Unscheduled tasks={unscheduled} writable={writable} colorFor={colorFor} />
      </div>
    </DndContext>
  );
}

type DeadlineMark = { id: string; title: string; taskId?: string };

function DeadlineFlags({ marks }: { marks?: DeadlineMark[] }) {
  const openTask = useUI((s) => s.openTask);
  const t = useTranslations("task");
  if (!marks?.length) return null;
  return (
    <div className="space-y-0.5" data-color="violet">
      {marks.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => m.taskId && openTask(m.taskId)}
          title={`${t("deadline")}: ${m.title}`}
          className="flex w-full items-center gap-1 rounded px-1 text-left text-[11px] leading-4 font-medium text-pc-fg"
        >
          <Milestone className="size-3 shrink-0" aria-hidden />
          <span className="sr-only">{t("deadline")}:</span>
          <span className="truncate">{m.title}</span>
        </button>
      ))}
    </div>
  );
}

function Agenda({
  days,
  byDay,
  deadlines,
  today,
  writable,
  colorFor,
}: {
  days: string[];
  byDay: Record<string, Task[]>;
  deadlines: Record<string, DeadlineMark[]>;
  today: string;
  writable: boolean;
  colorFor: (t: Task) => string | undefined;
}) {
  const t = useTranslations();
  const tz = useTz();
  const f = useFormat(today, tz);
  const busy = days.filter((d) => (byDay[d]?.length ?? 0) > 0 || deadlines[d]?.length || d === today);
  if (busy.length === 0) return <p className="rounded-2xl border bg-card p-6 text-center text-13 text-muted-foreground shadow-elev-1">{t("calendar.agendaEmpty")}</p>;
  return (
    <div className="space-y-3">
      {busy.map((d) => (
        <AgendaDay key={d} day={d} label={f.weekdayDate(d)} isToday={d === today} tasks={byDay[d] ?? []} deadlines={deadlines[d]} writable={writable} colorFor={colorFor} />
      ))}
    </div>
  );
}

function AgendaDay({ day, label, isToday, tasks, deadlines, writable, colorFor }: { day: string; label: string; isToday: boolean; tasks: Task[]; deadlines?: DeadlineMark[]; writable: boolean; colorFor: (t: Task) => string | undefined }) {
  const t = useTranslations("calendar");
  const { setNodeRef, isOver } = useDroppable({ id: day, disabled: !writable });
  return (
    <section ref={setNodeRef} aria-label={label} className={cn("rounded-2xl border bg-card p-2.5 shadow-elev-1 transition-colors", isOver && "bg-brand-soft")}>
      <h3 className={cn("mb-1.5 px-1 font-sans text-13 font-semibold tracking-normal", isToday ? "text-brand-fg" : "text-foreground")}>{label}</h3>
      <DeadlineFlags marks={deadlines} />
      <div className="space-y-1">
        {tasks.map((task) => (
          <Chip key={task.id} task={task} color={colorFor(task)} draggable={writable} wrap />
        ))}
        {tasks.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t("nothingToday")}</p>}
      </div>
    </section>
  );
}

function DayCell({
  day,
  tasks,
  deadlines,
  outside,
  isToday,
  tall,
  writable,
  colorFor,
  label,
  wrap,
}: {
  day: string;
  tasks: Task[];
  deadlines?: DeadlineMark[];
  outside: boolean;
  isToday: boolean;
  tall: boolean;
  writable: boolean;
  colorFor: (t: Task) => string | undefined;
  label: string;
  wrap?: boolean;
}) {
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
      <DeadlineFlags marks={deadlines} />
      <div className="space-y-1">
        {shown.map((task) => (
          <Chip key={task.id} task={task} color={colorFor(task)} draggable={writable} wrap={wrap} />
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

function Chip({ task, color, draggable, wrap }: { task: Task; color?: string; draggable: boolean; wrap?: boolean }) {
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
      title={`${task.due_at ? `${f.time(task.due_at)} ` : ""}${task.title}`}
      data-color={safeColor(color)}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined}
      className={cn(
        "flex w-full gap-1 rounded-md border-l-[3px] border-pc bg-pc-soft px-1.5 py-0.5 text-left leading-4 text-pc-fg",
        wrap ? "min-h-9 items-start py-1.5 text-13" : "items-center truncate text-[11.5px]",
        task.status === "done" && "line-through opacity-60",
        isDragging && "shadow-elev-3",
      )}
    >
      {task.due_at && <span className="shrink-0 font-semibold tnum">{f.time(task.due_at)}</span>}
      <span className={wrap ? "break-words" : "truncate"}>{task.title}</span>
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
