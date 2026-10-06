"use client";

import { Brain, CalendarDays, Check, CheckSquare, CirclePause, FolderInput, Send, GitBranch, GripVertical, MessageSquare, Star, Sun, Sunrise, Zap } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useTranslations } from "next-intl";
import { memo, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { AvatarStack, DueChip, PriorityIcon, ProjectBadge } from "@/components/common/bits";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { addDays } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import { isOverdue } from "@/lib/health";
import { followUpDue, waitingDays } from "@/lib/org";
import type { Task, TaskPriority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { moveTasks, rescheduleTasks, setTop, toggleComplete } from "@/store/actions";
import { assigneesByTask, checklistByTask, commentsByTask, labelsByTask, subtasksByParent, useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { DatePicker, ProjectPicker } from "./pickers";

const RING: Record<TaskPriority, string> = {
  urgent: "border-prio-urgent",
  high: "border-prio-high",
  medium: "border-prio-medium",
  low: "border-border-strong",
  none: "border-border-strong",
};

export function TaskCheckbox({
  task,
  onToggle,
  size = 18,
  disabled,
}: {
  task: Pick<Task, "status" | "priority" | "title">;
  onToggle: () => void;
  size?: number;
  disabled?: boolean;
}) {
  const t = useTranslations("task");
  const done = task.status === "done";
  const urgentFill = task.priority === "urgent" || task.priority === "high";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? t("markUndone") : t("markDone")}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{ width: size, height: size }}
      className={cn(
        "group/check tap-44 relative flex shrink-0 items-center justify-center rounded-full border-[1.75px] transition-all duration-200 ease-out",
        done ? "border-success bg-success" : cn(RING[task.priority], urgentFill && "bg-[color-mix(in_oklch,currentColor_0%,transparent)]"),
        !done && !disabled && "hover:bg-success/10",
        disabled && "opacity-50",
      )}
    >
      <svg viewBox="0 0 16 16" className={cn("size-[70%]", done ? "text-white" : "text-success opacity-0 group-hover/check:opacity-60")}>
        <path
          d="M3.5 8.5l3 3 6-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="16"
          className={done ? "animate-check" : ""}
          style={done ? undefined : { strokeDashoffset: 0 }}
        />
      </svg>
      {done && <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-success/40 [animation-iteration-count:1]" />}
    </button>
  );
}

export interface TaskRowProps {
  task: Task;
  showProject?: boolean;
  /** the day the surrounding group stands for: a task due that day does not repeat it */
  groupDate?: string | null;
  /** inbox: one-tap "to a project / today / tomorrow" under the row (the keyboard keys do not exist on a phone) */
  triage?: boolean;
  /** waiting lists: a "Soʻrash" button that shares a ready follow-up message (Telegram, WhatsApp…) */
  chase?: boolean;
  focused?: boolean;
  selected?: boolean;
  readOnly?: boolean;
  indent?: boolean;
  dragHandle?: HTMLAttributes<HTMLButtonElement>;
  onSelect?: (e: React.MouseEvent) => void;
  className?: string;
}

function TaskRowInner({ task, showProject, groupDate, triage, chase, focused, selected, readOnly, indent, dragHandle, onSelect, className }: TaskRowProps) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const openTask = useUI((s) => s.openTask);
  const project = useStore((s) => (task.project_id ? s.data.projects[task.project_id] : undefined));
  const taskAssignees = useStore((s) => s.data.task_assignees);
  const profiles = useStore((s) => s.data.profiles);
  const taskLabels = useStore((s) => s.data.task_labels);
  const labelsById = useStore((s) => s.data.labels);
  const checklistItems = useStore((s) => s.data.checklist_items);
  const allTasks = useStore((s) => s.data.tasks);
  const comments = useStore((s) => s.data.comments);
  const [completing, setCompleting] = useState(false);
  const [swipeSheet, setSwipeSheet] = useState(false);

  const meta = useMemo(() => {
    const assignees = (assigneesByTask(taskAssignees)[task.id] ?? []).map((a) => profiles[a.user_id]).filter(Boolean);
    const labels = (labelsByTask(taskLabels)[task.id] ?? []).map((l) => labelsById[l.label_id]).filter((l) => l && !l.deleted_at);
    const checklist = checklistByTask(checklistItems)[task.id] ?? [];
    const subtasks = subtasksByParent(allTasks)[task.id] ?? [];
    const commentCount = commentsByTask(comments)[task.id] ?? 0;
    return {
      assignees,
      labels,
      checklist: { done: checklist.filter((c) => c.done).length, total: checklist.length },
      subtasks: { done: subtasks.filter((s) => s.status === "done").length, total: subtasks.length },
      comments: commentCount,
    };
  }, [taskAssignees, profiles, taskLabels, labelsById, checklistItems, allTasks, comments, task.id]);

  const contactName = useStore((s) => (task.waiting_on_contact_id ? s.data.contacts[task.waiting_on_contact_id]?.name : undefined));
  const waiting =
    task.waiting_on_contact_id || task.waiting_on_user_id
      ? {
          name: contactName ?? (task.waiting_on_user_id ? profiles[task.waiting_on_user_id]?.name : undefined) ?? "…",
          days: waitingDays(task, today) ?? 0,
          chase: followUpDue(task, today),
        }
      : null;
  const done = task.status === "done" || completing;
  const overdue = isOverdue(task, today);
  const isTop = task.top_date === today;

  const complete = () => {
    if (readOnly) return;
    if (task.status === "done") {
      toggleComplete(task);
      return;
    }
    setCompleting(true);
    setTimeout(() => {
      toggleComplete(task);
      setCompleting(false);
    }, 380);
  };

  // swipe gestures (touch only)
  const x = useMotionValue(0);
  const rightBg = useTransform(x, [0, 96], [0, 1]);
  const leftBg = useTransform(x, [-96, 0], [1, 0]);
  const dragged = useRef(false);
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  const row = (
    <div
      role="row"
      aria-selected={selected}
      data-task-id={task.id}
      tabIndex={focused ? 0 : -1}
      onClick={(e) => {
        if (dragged.current) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          onSelect?.(e);
          return;
        }
        openTask(task.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") openTask(task.id);
      }}
      className={cn(
        "group/row relative flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 outline-none transition-colors duration-150",
        "hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/40",
        focused && "bg-muted/70",
        selected && "bg-brand-soft hover:bg-brand-soft",
        indent && "pl-9",
        completing && "opacity-60",
        className,
      )}
    >
      {/* a grid row holds cells: one cell with everything (display: contents keeps the layout) */}
      <div role="gridcell" className="contents">
      {overdue && !done && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-destructive" />}
      {dragHandle && !readOnly && (
        <button
          {...dragHandle}
          aria-label={t("task.dragHandle")}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2.5 -left-4 hidden cursor-grab touch-none text-subtle-foreground opacity-0 group-hover/row:opacity-100 active:cursor-grabbing md:block"
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <div className="pt-0.5">
        <TaskCheckbox task={{ ...task, status: done ? "done" : task.status }} onToggle={complete} disabled={readOnly} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn("min-w-0 flex-1 text-sm leading-5 break-words", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>
            {task.title}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {isTop && <Star role="img" aria-label={t("task.top3")} className="size-3.5 fill-warning text-warning" />}
            {task.energy === "deep" && <Brain role="img" aria-label={t("energy.deep")} className="size-3.5 text-[var(--pc-violet-fg)]" />}
            {task.energy === "quick" && <Zap role="img" aria-label={t("energy.quick")} className="size-3.5 text-[var(--pc-amber-fg)]" />}
            {task.priority !== "none" && <PriorityIcon priority={task.priority} />}
            {meta.assignees.length > 0 && <AvatarStack people={meta.assignees} size={20} max={2} />}
          </div>
        </div>
        {((task.due_date && !(groupDate && task.due_date === groupDate && !task.due_at && !task.recurrence)) || task.deadline || showProject || waiting || meta.labels.length > 0 || meta.checklist.total > 0 || meta.subtasks.total > 0 || meta.comments > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <DueChip date={task.due_date} dueAt={task.due_at} deadline={task.deadline} recurring={Boolean(task.recurrence)} done={done} hideDay={Boolean(groupDate) && task.due_date === groupDate} />
            {waiting && !done && (
              <span className={cn("inline-flex items-center gap-1 text-xs tnum", waiting.chase ? "font-medium text-warning-fg" : "text-muted-foreground")}>
                <CirclePause className="size-3" />
                {t("waiting.onShort", { name: waiting.name, count: waiting.days })}
              </span>
            )}
            {meta.subtasks.total > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tnum">
                <GitBranch className="size-3" />
                {t("common.of", { done: meta.subtasks.done, total: meta.subtasks.total })}
              </span>
            )}
            {meta.checklist.total > 0 && (
              <span className={cn("inline-flex items-center gap-1 text-xs tnum", meta.checklist.done === meta.checklist.total ? "text-success-fg" : "text-muted-foreground")}>
                <CheckSquare className="size-3" />
                {t("common.of", { done: meta.checklist.done, total: meta.checklist.total })}
              </span>
            )}
            {meta.comments > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tnum">
                <MessageSquare className="size-3" />
                {meta.comments}
              </span>
            )}
            {meta.labels.map((l) => (
              <span key={l.id} data-color={l.color} className="rounded-md bg-pc-soft px-1.5 py-px text-[11px] font-medium text-pc-fg">
                {l.name}
              </span>
            ))}
            {showProject && project && <ProjectBadge name={project.name} color={project.color} />}
            {showProject && !project && !task.project_id && <span className="text-xs text-muted-foreground">{t("nav.inbox")}</span>}
          </div>
        )}
        {chase && !done && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => shareFollowUp(t("waiting.chaseText", { title: task.title, date: task.due_date ? f.relativeDay(task.due_date) : "—" }))} className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:bg-muted">
              <Send className="size-3.5" aria-hidden /> {t("waiting.chase")}
            </button>
          </div>
        )}
        {triage && !readOnly && !done && (
          <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
            <ProjectPicker value={task.project_id} allowInbox={false} onChange={(projectId, sectionId) => moveTasks([task.id], { projectId, sectionId })}>
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:bg-muted">
                <FolderInput className="size-3.5" aria-hidden /> {t("inbox.toProject")}
              </button>
            </ProjectPicker>
            {task.due_date !== today && (
              <button type="button" onClick={() => rescheduleTasks([task.id], today)} className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:bg-muted">
                <Sun className="size-3.5" aria-hidden /> {t("common.today")}
              </button>
            )}
            {task.due_date !== addDays(today, 1) && (
              <button type="button" onClick={() => rescheduleTasks([task.id], addDays(today, 1))} className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:bg-muted">
                <Sunrise className="size-3.5" aria-hidden /> {t("common.tomorrow")}
              </button>
            )}
          </div>
        )}
      </div>

      {!readOnly && (
        <div
          className="absolute top-1.5 right-2 hidden items-center gap-0.5 rounded-md bg-card/90 p-0.5 shadow-elev-1 backdrop-blur group-hover/row:flex group-focus-within/row:flex [@media(hover:none)]:!hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setTop(task, !isTop)}
            aria-label={isTop ? t("home.top3Remove") : t("home.top3Add")}
            aria-pressed={isTop}
            className={cn("rounded p-1 hover:bg-muted", isTop ? "text-warning" : "text-muted-foreground")}
          >
            <Star className={cn("size-3.5", isTop && "fill-current")} />
          </button>
          <DatePicker value={task.due_date} onChange={(d) => rescheduleTasks([task.id], d)} allowTime={false} align="end">
            <button aria-label={t("task.reschedule")} className="rounded p-1 text-muted-foreground hover:bg-muted">
              <CalendarDays className="size-3.5" />
            </button>
          </DatePicker>
        </div>
      )}
      </div>
    </div>
  );

  if (!coarse || readOnly) return row;

  return (
    <div className="relative overflow-hidden rounded-lg">
      <motion.div style={{ opacity: rightBg }} className="absolute inset-0 flex items-center bg-success pl-5 text-white">
        <Check className="size-5" /> <span className="ml-2 text-sm font-medium">{t("task.swipeDone")}</span>
      </motion.div>
      <motion.div style={{ opacity: leftBg }} className="absolute inset-0 flex items-center justify-end bg-info pr-5 text-white">
        <span className="mr-2 text-sm font-medium">{t("task.swipeLater")}</span> <CalendarDays className="size-5" />
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        style={{ x }}
        className="relative bg-background"
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => {
          setTimeout(() => (dragged.current = false), 50);
          if (info.offset.x > 90) complete();
          else if (info.offset.x < -90) setSwipeSheet(true);
          void animate(x, 0, { duration: 0.2 });
        }}
      >
        {row}
      </motion.div>
      <Sheet open={swipeSheet} onOpenChange={setSwipeSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader>
            <SheetTitle className="truncate">{task.title}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4">
            {[
              { label: t("common.today"), date: today, icon: Sun },
              { label: t("common.tomorrow"), date: addDays(today, 1), icon: Sunrise },
              { label: t("common.nextWeek"), date: addDays(today, 7), icon: CalendarDays },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => { rescheduleTasks([task.id], o.date); setSwipeSheet(false); }}
                className="flex flex-col items-center gap-1.5 rounded-xl border bg-card p-4 text-sm font-medium shadow-elev-1"
              >
                <o.icon className="size-5 text-brand" /> {o.label}
              </button>
            ))}
          </div>
          <div className="px-4 pt-3">
            <DatePicker value={task.due_date} onChange={(d) => { rescheduleTasks([task.id], d); setSwipeSheet(false); }} allowTime={false}>
              <button className="h-11 w-full rounded-xl border text-sm font-medium">{t("common.pickDate")}</button>
            </DatePicker>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export const TaskRow = memo(TaskRowInner);

/** The phone's share sheet when there is one (Telegram, WhatsApp…), otherwise Telegram's share page. */
function shareFollowUp(text: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    navigator.share({ text }).catch(() => {});
    return;
  }
  window.open(`https://t.me/share/url?url=${encodeURIComponent(text)}`, "_blank", "noopener");
}
