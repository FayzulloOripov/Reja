"use client";

import {
  Bell,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  Hourglass,
  Inbox,
  MoreHorizontal,
  Repeat,
  Star,
  Tag,
  Timer,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PriorityIcon, ProjectDot, StatusIcon, UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { RichEditor } from "@/components/editor/rich-editor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { canWrite } from "@/lib/permissions";
import { zonedToUtc } from "@/lib/dates";
import { PRESET_RULES, upcomingOccurrences } from "@/lib/recurrence";
import { useFormat } from "@/lib/format";
import { parseDuration } from "@/lib/parse/duration";
import type { ReminderOffset, RichDoc, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addReminder,
  assign,
  createLabel,
  deleteTasks,
  moveTasks,
  removeReminder,
  setDue,
  setTop,
  toggleComplete,
  toggleLabel,
  toggleWatch,
  updateTask,
} from "@/store/actions";
import {
  useLabels,
  useProject,
  useProjectAccess,
  useProjectPeople,
  useSections,
  useTask,
  useTaskAssigneeIds,
  useTaskLabels,
  useToday,
  useTz,
  useUserId,
} from "@/store/hooks";
import { ensureTaskDetail, useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { useRecurrenceLabel } from "./quick-add";
import { useSyncedState } from "@/hooks/use-synced-state";
import { AssigneePicker, DatePicker, LabelPicker, PriorityPicker, ProjectPicker, StatusPicker } from "./pickers";
import { TaskCheckbox } from "./task-row";
import { AttachmentsSection, ChecklistSection, CommentsAndActivity, DependenciesSection, SubtasksSection } from "./task-detail-sections";
import { useTaskPresence } from "@/hooks/use-presence";

function Prop({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <div className="flex h-8 items-center gap-2 text-13 text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </div>
      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function PropButton({ children, className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn("inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-13 hover:bg-muted disabled:pointer-events-none", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function TaskDetail({ taskId, onClose, fullPage }: { taskId: string; onClose?: () => void; fullPage?: boolean }) {
  const t = useTranslations();
  const task = useTask(taskId);
  const status = useStore((s) => s.status);

  useEffect(() => {
    void ensureTaskDetail(taskId);
  }, [taskId]);

  if (!task || task.deleted_at) {
    if (status === "loading" || status === "idle") return <div className="p-6"><div className="h-6 w-2/3 animate-pulse rounded bg-muted" /></div>;
    return <EmptyState illustration="search" title={t("task.notFound")} action={onClose && <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>} />;
  }
  return <TaskDetailBody task={task} onClose={onClose} fullPage={fullPage} />;
}

function TaskDetailBody({ task, onClose, fullPage }: { task: Task; onClose?: () => void; fullPage?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const uid = useUserId();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const project = useProject(task.project_id);
  const access = useProjectAccess(project);
  const writable = task.project_id ? canWrite(access) : task.created_by === uid || !task.created_by;
  const sections = useSections(task.project_id ?? undefined);
  const people = useProjectPeople(project);
  const assigneeIds = useTaskAssigneeIds(task.id);
  const labels = useTaskLabels(task.id);
  const allLabels = useLabels(task.workspace_id);
  const profiles = useStore((s) => s.data.profiles);
  const reminders = useStore((s) => s.data.reminders);
  const watchers = useStore((s) => s.data.task_watchers);
  const timeEntries = useStore((s) => s.data.time_entries);
  const parent = useTask(task.parent_id);
  const recurrenceLabel = useRecurrenceLabel();
  const openTask = useUI((s) => s.openTask);
  const editors = useTaskPresence(task, true);

  const [title, setTitle] = useSyncedState(task.title);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [title]);

  const myReminders = useMemo(
    () => Object.values(reminders).filter((r) => r.task_id === task.id && r.user_id === uid && r.status !== "dismissed").sort((a, b) => a.remind_at.localeCompare(b.remind_at)),
    [reminders, task.id, uid],
  );
  const watching = Boolean(watchers[`${task.id}|${uid}`]);
  const logged = useMemo(() => Object.values(timeEntries).filter((e) => e.task_id === task.id).reduce((n, e) => n + e.minutes, 0), [timeEntries, task.id]);
  const dueTime = task.due_at ? f.time(task.due_at) : null;
  const isTop = task.top_date === today;

  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDesc = useRef<{ doc: RichDoc } | null>(null);
  const latestTitle = useRef(title);
  useEffect(() => {
    latestTitle.current = title;
  }, [title]);

  // closing the panel quickly must not lose typing: save what is pending when it unmounts
  useEffect(() => {
    const id = task.id;
    const original = task.title;
    return () => {
      if (descTimer.current) clearTimeout(descTimer.current);
      if (pendingDesc.current) updateTask(id, { description: pendingDesc.current.doc });
      const v = latestTitle.current.trim();
      if (v && v !== original && v !== useStore.getState().data.tasks[id]?.title) updateTask(id, { title: v });
    };
    // runs once per task panel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  function saveTitle() {
    const v = title.trim();
    if (v && v !== task.title) updateTask(task.id, { title: v });
    else setTitle(task.title);
  }

  const link = typeof window !== "undefined" ? `${window.location.origin}/tasks/${task.id}` : `/tasks/${task.id}`;

  return (
    <div className="flex min-h-full flex-col">
      {/* header */}
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b bg-popover/95 px-4 py-2 backdrop-blur">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-13 text-muted-foreground" aria-label="breadcrumb">
          {project ? (
            <Link href={`/projects/${project.id}`} className="flex min-w-0 items-center gap-1.5 rounded px-1 hover:text-foreground" onClick={onClose}>
              <ProjectDot color={project.color} size="sm" />
              <span className="truncate">{project.name}</span>
            </Link>
          ) : (
            <Link href="/inbox" className="flex items-center gap-1.5 rounded px-1 hover:text-foreground" onClick={onClose}>
              <Inbox className="size-3.5" /> {t("nav.inbox")}
            </Link>
          )}
          {parent && (
            <>
              <ChevronRight className="size-3.5 shrink-0" />
              <button onClick={() => openTask(parent.id)} className="truncate rounded px-1 hover:text-foreground">{parent.title}</button>
            </>
          )}
        </nav>
        {editors.length > 0 && (
          <span className="mr-1 hidden items-center gap-1.5 rounded-full bg-info-soft px-2 py-0.5 text-xs text-info-fg sm:inline-flex">
            <UserAvatar profile={editors[0]} size={16} /> {t("task.editing", { name: editors[0].name })}
          </span>
        )}
        {writable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button tooltip={false} variant="ghost" size="icon-sm" onClick={() => setTop(task, !isTop)} aria-pressed={isTop} aria-label={isTop ? t("home.top3Remove") : t("home.top3Add")}>
                <Star className={cn(isTop ? "fill-warning text-warning" : "text-muted-foreground")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isTop ? t("home.top3Remove") : t("home.top3Add")}</TooltipContent>
          </Tooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("common.more")}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => { void navigator.clipboard.writeText(link); toast.success(t("common.copied")); }}>
              <Copy /> {t("task.copyLink")}
            </DropdownMenuItem>
            {!fullPage && (
              <DropdownMenuItem onSelect={() => { onClose?.(); router.push(`/tasks/${task.id}`); }}>
                <ExternalLink /> {t("task.openFull")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => router.push(`/focus?task=${task.id}`)}>
              <Timer /> {t("task.focus")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toggleWatch(task, !watching)}>
              {watching ? <EyeOff /> : <Eye />} {watching ? t("task.unwatch") : t("task.watch")}
            </DropdownMenuItem>
            {writable && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => { deleteTasks([task.id]); onClose?.(); }}>
                  <Trash2 /> {t("common.delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("common.close")}>
            <X />
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-6 px-5 py-5 sm:px-6">
        {/* title */}
        <div className="flex items-start gap-3">
          <div className="pt-1.5">
            <TaskCheckbox task={task} onToggle={() => toggleComplete(task)} size={22} disabled={!writable} />
          </div>
          <textarea
            ref={titleRef}
            value={title}
            rows={1}
            readOnly={!writable}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
              if (e.key === "Escape") {
                setTitle(task.title);
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            aria-label={t("task.titlePlaceholder")}
            className={cn(
              "flex-1 resize-none overflow-hidden bg-transparent font-display text-22 leading-snug font-bold outline-none",
              task.status === "done" && "text-muted-foreground line-through",
            )}
          />
        </div>

        {/* properties */}
        <div className="grid grid-cols-[minmax(7.5rem,auto)_1fr] gap-x-3 gap-y-0.5">
          <Prop icon={<StatusIcon status={task.status} />} label={t("status.label")}>
            <StatusPicker value={task.status} onChange={(s) => updateTask(task.id, { status: s })}>
              <PropButton disabled={!writable}>{t(`status.${task.status}`)}</PropButton>
            </StatusPicker>
          </Prop>

          <Prop icon={<CalendarDays />} label={t("task.due")}>
            <DatePicker value={task.due_date} time={dueTime} onChange={(d, tm) => setDue(task, d, tm)}>
              <PropButton disabled={!writable} className={cn(!task.due_date && "text-muted-foreground")}>
                {task.due_date ? f.relativeDay(task.due_date) : t("common.noDate")}
                {dueTime && <span className="inline-flex items-center gap-1 text-muted-foreground tnum"><Clock className="size-3" />{dueTime}</span>}
              </PropButton>
            </DatePicker>
          </Prop>

          <Prop icon={<CalendarRange />} label={t("task.start")}>
            <DatePicker value={task.start_date} onChange={(d) => updateTask(task.id, { start_date: d, ...(d && task.due_date && d > task.due_date ? { due_date: d, due_at: null } : {}) })} allowTime={false}>
              <PropButton disabled={!writable} className={cn(!task.start_date && "text-muted-foreground")}>
                {task.start_date ? f.relativeDay(task.start_date) : t("common.none")}
              </PropButton>
            </DatePicker>
          </Prop>

          <Prop icon={<Flag />} label={t("task.deadline")}>
            <DatePicker value={task.deadline} onChange={(d) => updateTask(task.id, { deadline: d })} allowTime={false}>
              <PropButton disabled={!writable} title={t("task.deadlineHint")} className={cn(!task.deadline && "text-muted-foreground")}>
                {task.deadline ? f.dayMonth(task.deadline) : t("common.none")}
              </PropButton>
            </DatePicker>
          </Prop>

          <Prop icon={<PriorityIcon priority={task.priority} />} label={t("priority.label")}>
            <PriorityPicker value={task.priority} onChange={(p) => updateTask(task.id, { priority: p })}>
              <PropButton disabled={!writable} className={cn(task.priority === "none" && "text-muted-foreground")}>{t(`priority.${task.priority}`)}</PropButton>
            </PriorityPicker>
          </Prop>

          <Prop icon={<ProjectDot color={project?.color} />} label={t("task.project")}>
            <ProjectPicker value={task.project_id} sectionId={task.section_id} sections={sections} onChange={(p, s) => {
              if (p === task.project_id) updateTask(task.id, { section_id: s ?? null });
              else moveTasks([task.id], { projectId: p, sectionId: s });
            }}>
              <PropButton disabled={!writable || Boolean(task.parent_id)}>
                <span className="truncate">{project?.name ?? t("nav.inbox")}</span>
                {task.section_id && <span className="truncate text-muted-foreground">· {sections.find((s) => s.id === task.section_id)?.name}</span>}
              </PropButton>
            </ProjectPicker>
          </Prop>

          <Prop icon={<UserPlus />} label={t("task.assignees")}>
            {assigneeIds.map((id) => (
              <span key={id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2 pl-0.5 text-13">
                <UserAvatar profile={profiles[id]} size={22} />
                {profiles[id]?.name ?? "…"}
              </span>
            ))}
            {writable && (
              <AssigneePicker people={people} selected={assigneeIds} onToggle={(id, on) => assign(task, id, on)}>
                <PropButton className="text-muted-foreground">{assigneeIds.length ? "+" : t("task.assign")}</PropButton>
              </AssigneePicker>
            )}
          </Prop>

          <Prop icon={<Tag />} label={t("task.labels")}>
            {labels.map((l) => (
              <span key={l.id} data-color={l.color} className="inline-flex h-6 items-center rounded-md bg-pc-soft px-2 text-xs font-medium text-pc-fg">
                {l.name}
              </span>
            ))}
            {writable && (
              <LabelPicker
                labels={allLabels}
                selected={labels.map((l) => l.id)}
                onToggle={(id, on) => toggleLabel(task, id, on)}
                onCreate={(name) => {
                  const l = createLabel(task.workspace_id, name, "sky");
                  toggleLabel(task, l.id, true);
                }}
              >
                <PropButton className="text-muted-foreground">{labels.length ? "+" : t("task.addLabel")}</PropButton>
              </LabelPicker>
            )}
          </Prop>

          <Prop icon={<Repeat />} label={t("task.repeat")}>
            <RepeatPicker task={task} disabled={!writable} label={recurrenceLabel(task.recurrence)} />
          </Prop>

          <Prop icon={<Hourglass />} label={t("task.estimate")}>
            <EstimateInput task={task} disabled={!writable} />
            {logged > 0 && <span className="text-xs text-muted-foreground tnum">· {t("task.timeLogged")}: {f.duration(logged)}</span>}
          </Prop>

          <Prop icon={<Bell />} label={t("task.reminders")}>
            {myReminders.map((r) => (
              <span key={r.id} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs tnum", r.status === "sent" && "text-muted-foreground")}>
                <Bell className="size-3" />
                {f.relativeDay(dateOf(r.remind_at, tz))} {f.time(r.remind_at)}
                {r.is_auto && <span className="text-muted-foreground">·A</span>}
                {r.status === "sent" && <span>✓</span>}
                <button onClick={() => removeReminder(r.id)} aria-label={t("common.delete")} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <ReminderAdder task={task} />
          </Prop>
        </div>

        {/* description */}
        <div className="rounded-xl border bg-card/50 px-3.5 py-3">
          <RichEditor
            value={task.description}
            editable={writable}
            toolbar
            placeholder={t("task.descriptionPlaceholder")}
            ariaLabel={t("common.description")}
            onChange={(doc) => {
              if (descTimer.current) clearTimeout(descTimer.current);
              pendingDesc.current = { doc };
              descTimer.current = setTimeout(() => {
                pendingDesc.current = null;
                updateTask(task.id, { description: doc });
              }, 600);
            }}
          />
        </div>

        {!task.parent_id && <SubtasksSection task={task} writable={writable} />}
        <ChecklistSection task={task} writable={writable} />
        <DependenciesSection task={task} writable={writable} />
        <AttachmentsSection task={task} writable={writable} />
        <CommentsAndActivity task={task} writable={writable} people={people} />

        <p className="pb-4 text-xs text-muted-foreground">
          {task.created_by === uid
            ? t("task.createdByYou", { date: f.ago(task.created_at) })
            : t("task.createdBy", { name: profiles[task.created_by ?? ""]?.name ?? t("common.system"), date: f.ago(task.created_at) })}
          {task.source === "telegram" && ` · ${t("inbox.fromTelegram")}`}
        </p>
      </div>
    </div>
  );
}

function dateOf(instant: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}

function RepeatPicker({ task, disabled, label }: { task: Task; disabled: boolean; label: string }) {
  const t = useTranslations("task");
  const [open, setOpen] = useState(false);
  const today = useToday();
  const options: [string | null, string][] = [
    [null, t("repeatNone")],
    [PRESET_RULES.daily, t("repeatDaily")],
    [PRESET_RULES.weekdays, t("repeatWeekdays")],
    [PRESET_RULES.weekly, t("repeatWeekly")],
    [PRESET_RULES.monthly, t("repeatMonthly")],
    [PRESET_RULES.yearly, t("repeatYearly")],
  ];
  const set = (rule: string | null) => {
    let r = rule;
    // weekly on the task's weekday
    if (r === "FREQ=WEEKLY") {
      const dow = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"][((new Date(`${task.due_date ?? today}T00:00:00Z`).getUTCDay() + 6) % 7)];
      r = `FREQ=WEEKLY;BYDAY=${dow}`;
    }
    updateTask(task.id, { recurrence: r, ...(r && !task.due_date ? { due_date: upcomingOccurrences(r, today, 1)[0] ?? today } : {}) });
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PropButton disabled={disabled} className={cn(!task.recurrence && "text-muted-foreground")}>
          {label}
        </PropButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        {options.map(([rule, l]) => (
          <button key={l} onClick={() => set(rule)} className={cn("flex h-8 w-full items-center rounded-md px-2 text-13 hover:bg-muted", (task.recurrence ?? null) === rule && "font-medium")}>
            {l}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function EstimateInput({ task, disabled }: { task: Task; disabled: boolean }) {
  const t = useTranslations("task");
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const shown = task.estimate_min ? f.duration(task.estimate_min) : "";
  const [v, setV] = useSyncedState(shown);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (!v.trim()) {
      setInvalid(false);
      if (task.estimate_min !== null) updateTask(task.id, { estimate_min: null });
      return;
    }
    const n = parseDuration(v);
    if (n === null || n > 10_000) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (n !== task.estimate_min) updateTask(task.id, { estimate_min: n });
    setV(f.duration(n));
  };
  return (
    <label className="inline-flex flex-col gap-0.5">
      <Input
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder={t("estimateHint")}
        aria-invalid={invalid}
        aria-label={t("estimate")}
        className="h-8 w-36"
      />
      {invalid && <span className="text-xs text-danger-fg">{t("estimateInvalid")}</span>}
    </label>
  );
}

function ReminderAdder({ task }: { task: Task }) {
  const t = useTranslations("task");
  const tz = useTz();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const add = (o: ReminderOffset, at?: Date) => {
    addReminder(task, o, at);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PropButton className="text-muted-foreground">+ {t("addReminder")}</PropButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        {(["at_due", "15m", "1h", "1d"] as const).map((o) => (
          <button key={o} disabled={!task.due_date} onClick={() => add(o)} className="flex h-8 w-full items-center rounded-md px-2 text-13 hover:bg-muted disabled:opacity-40">
            {t(o === "at_due" ? "reminderAtDue" : o === "15m" ? "reminder15m" : o === "1h" ? "reminder1h" : "reminder1d")}
          </button>
        ))}
        {!task.due_date && <p className="px-2 py-1 text-xs text-muted-foreground">{t("reminderNeedsDue")}</p>}
        <div className="mt-1 space-y-1.5 border-t p-2">
          <p className="text-xs font-medium">{t("reminderCustom")}</p>
          <Input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-8" />
          <Button size="sm" className="w-full" disabled={!custom} onClick={() => add("custom", zonedToUtc(custom.slice(0, 10), custom.slice(11, 16), tz))}>
            {t("addReminder")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
