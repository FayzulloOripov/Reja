"use client";

import { AlertTriangle, CalendarDays, Clock, Flag, Inbox, Repeat, Star, Undo2, User, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useOnChange } from "@/hooks/use-synced-state";
import { toast } from "sonner";
import { PriorityIcon, ProjectDot, UserAvatar, Kbd } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useFormat, capitalize } from "@/lib/format";
import { describeRecurrence, parseQuickAdd, type ChipKind } from "@/lib/parse/quick-add";
import type { TaskPriority } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createTask } from "@/store/actions";
import { useCurrentWorkspace, useMe, useNowMinutes, useProfiles, useProjects, useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { DatePicker, PriorityPicker, ProjectPicker } from "./pickers";

const CHIP_STYLE: Record<ChipKind, string> = {
  date: "bg-brand-soft text-brand-fg",
  time: "bg-brand-soft text-brand-fg",
  repeat: "bg-info-soft text-info-fg",
  project: "bg-[var(--pc-violet-soft)] text-[var(--pc-violet-fg)]",
  person: "bg-success-soft text-success-fg",
  priority: "bg-danger-soft text-danger-fg",
  top: "bg-warning-soft text-warning-fg",
};

export function useRecurrenceLabel() {
  const t = useTranslations("task");
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  return (rule: string | null) => {
    if (!rule) return t("repeatNone");
    const d = describeRecurrence(rule);
    const days = d.days.map((x) => f.weekdaysShort[x - 1]).join(", ");
    if (d.key === "weekly" && d.days.length >= 6) return t("repeatWeekdays");
    const base = { daily: t("repeatDaily"), weekly: t("repeatWeekly"), monthly: t("repeatMonthly"), yearly: t("repeatYearly") }[d.key] ?? t("repeatCustom");
    const interval = d.interval > 1 ? ` ×${d.interval}` : "";
    return `${base}${interval}${days && d.key === "weekly" ? `: ${days}` : ""}`;
  };
}

export function QuickAddDialog() {
  const t = useTranslations();
  const { open, defaults } = useUI((s) => s.quickAdd);
  const close = useUI((s) => s.closeQuickAdd);
  const today = useToday();
  const tz = useTz();
  const nowMinutes = useNowMinutes();
  const f = useFormat(today, tz);
  const me = useMe();
  const ws = useCurrentWorkspace();
  const projects = useProjects();
  const profiles = useProfiles();
  const members = useStore((s) => s.data.workspace_members);
  const recurrenceLabel = useRecurrenceLabel();
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [text, setText] = useState("");
  const [manual, setManual] = useState<{ projectId?: string | null; sectionId?: string | null; dueDate?: string | null; dueTime?: string | null; priority?: TaskPriority }>({});
  // parsed parts the user tapped away: their words stay in the title and are not interpreted
  const [dismissed, setDismissed] = useState<ChipKind[]>([]);

  useOnChange(open, (o) => {
    if (!o) return;
    setText("");
    setManual({});
    setDismissed([]);
  });

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      const late = setTimeout(() => inputRef.current?.focus(), 120);
      return () => {
        cancelAnimationFrame(id);
        clearTimeout(late);
      };
    }
  }, [open]);

  const people = useMemo(() => {
    const ids = new Set(Object.values(members).filter((m) => m.workspace_id === ws?.id).map((m) => m.user_id));
    return [...ids].map((id) => profiles[id]).filter(Boolean).map((p) => ({ id: p.id, name: p.name }));
  }, [members, profiles, ws?.id]);

  const raw = useMemo(
    () =>
      parseQuickAdd(text, {
        today,
        nowMinutes,
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        people,
        workDays: me?.work_days,
      }),
    [text, today, nowMinutes, projects, people, me?.work_days],
  );
  const parsed = useMemo(() => {
    if (dismissed.length === 0) return raw;
    const off = new Set(dismissed);
    let cursor = 0;
    let title = "";
    for (const c of raw.chips) {
      title += text.slice(cursor, c.start) + (off.has(c.kind) ? text.slice(c.start, c.end) : " ");
      cursor = c.end;
    }
    title = (title + text.slice(cursor)).replace(/\s+/g, " ").trim();
    return {
      ...raw,
      title,
      chips: raw.chips.filter((c) => !off.has(c.kind)),
      dueDate: off.has("date") ? null : raw.dueDate,
      dueTime: off.has("time") || off.has("date") ? null : raw.dueTime,
      recurrence: off.has("repeat") ? null : raw.recurrence,
      projectId: off.has("project") ? null : raw.projectId,
      assigneeIds: off.has("person") ? [] : raw.assigneeIds,
      priority: off.has("priority") ? null : raw.priority,
      top: off.has("top") ? false : raw.top,
    };
  }, [raw, dismissed, text]);

  const projectId = manual.projectId !== undefined ? manual.projectId : (parsed.projectId ?? defaults?.projectId ?? null);
  const project = projects.find((p) => p.id === projectId);
  const dueDate = manual.dueDate !== undefined ? manual.dueDate : (parsed.dueDate ?? defaults?.dueDate ?? null);
  const dueTime = manual.dueTime !== undefined ? manual.dueTime : parsed.dueTime;
  const priority = manual.priority ?? parsed.priority ?? defaults?.priority ?? "none";
  const top = parsed.top || Boolean(defaults?.top);

  function submit(keepOpen: boolean) {
    const title = parsed.title.trim();
    if (!title) return;
    createTask({
      ...defaults,
      title,
      workspaceId: project?.workspace_id ?? ws?.id,
      projectId,
      sectionId: manual.sectionId ?? (projectId === defaults?.projectId ? defaults?.sectionId : null) ?? null,
      dueDate,
      dueTime,
      priority,
      recurrence: parsed.recurrence,
      top,
      assigneeIds: parsed.assigneeIds.length ? parsed.assigneeIds : defaults?.assigneeIds,
    });
    toast.success(navigator.onLine ? t("quickAdd.added") : t("quickAdd.addedOffline"));
    if (keepOpen) {
      setText("");
      setDismissed([]);
      setManual({ projectId: manual.projectId });
      inputRef.current?.focus();
    } else {
      close();
    }
  }

  // keep the mirror scrolled with the input after every change, not only on scroll events
  useLayoutEffect(() => {
    if (overlayRef.current && inputRef.current) overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
  });

  // highlighted mirror of the input
  const segments = useMemo(() => {
    const out: { text: string; kind?: ChipKind }[] = [];
    let cursor = 0;
    for (const c of parsed.chips) {
      if (c.start > cursor) out.push({ text: text.slice(cursor, c.start) });
      out.push({ text: text.slice(c.start, c.end), kind: c.kind });
      cursor = c.end;
    }
    out.push({ text: text.slice(cursor) });
    return out;
  }, [parsed.chips, text]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        showCloseButton={false}
        className="top-[max(1rem,12vh)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">{t("quickAdd.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("quickAdd.hint")}</DialogDescription>
        <div className="relative px-4 pt-4">
          <div
            ref={overlayRef}
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-4 h-11 overflow-hidden pr-10 text-[17px] leading-[44px] whitespace-pre"
          >
            {segments.map((s, i) =>
              s.kind ? (
                <mark key={i} className={cn("rounded-[5px]", CHIP_STYLE[s.kind], "text-transparent")}>
                  {s.text}
                </mark>
              ) : (
                <span key={i} className="text-transparent">
                  {s.text}
                </span>
              ),
            )}
          </div>
          <input
            ref={inputRef}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onScroll={(e) => {
              if (overlayRef.current) overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit(e.metaKey || e.ctrlKey);
              }
            }}
            placeholder={t("quickAdd.placeholder")}
            aria-label={t("quickAdd.title")}
            autoComplete="off"
            spellCheck={false}
            className="relative h-11 w-full bg-transparent pr-10 text-[17px] leading-[44px] outline-none placeholder:text-subtle-foreground"
          />
          <button
            type="button"
            onClick={close}
            aria-label={t("common.close")}
            className="absolute top-4 right-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {raw.chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2" aria-label={t("quickAdd.recognized")}>
            <span className="text-xs text-muted-foreground">{t("quickAdd.recognized")}:</span>
            {raw.chips.map((c) => {
              const off = dismissed.includes(c.kind);
              return (
                <button
                  key={`${c.kind}-${c.start}`}
                  type="button"
                  onClick={() => setDismissed((d) => (off ? d.filter((k) => k !== c.kind) : [...d, c.kind]))}
                  aria-pressed={!off}
                  aria-label={off ? t("quickAdd.restoreChip", { text: text.slice(c.start, c.end) }) : t("quickAdd.dismissChip", { text: text.slice(c.start, c.end) })}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium",
                    off ? "bg-muted text-muted-foreground line-through" : CHIP_STYLE[c.kind],
                  )}
                >
                  {text.slice(c.start, c.end).trim()}
                  {off ? <Undo2 className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex min-h-10 flex-wrap items-center gap-1.5 px-4 pt-2 pb-3">
          <ProjectPicker value={projectId} onChange={(p, s) => setManual((m) => ({ ...m, projectId: p, sectionId: s }))}>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 bg-card">
              {project ? <ProjectDot color={project.color} size="sm" /> : <Inbox className="size-3.5" />}
              <span className="max-w-[10rem] truncate">{project?.name ?? t("quickAdd.inbox")}</span>
            </Button>
          </ProjectPicker>
          <DatePicker value={dueDate} time={dueTime} onChange={(d, tm) => setManual((m) => ({ ...m, dueDate: d, dueTime: tm ?? null }))}>
            <Button variant="outline" size="sm" className={cn("h-7 gap-1.5 bg-card", dueDate && "border-brand/40 text-brand-fg")}>
              <CalendarDays className="size-3.5" />
              {dueDate ? f.relativeDay(dueDate) : t("quickAdd.chipDate")}
              {dueTime && (
                <span className="inline-flex items-center gap-0.5 tnum">
                  <Clock className="size-3" />
                  {dueTime}
                </span>
              )}
            </Button>
          </DatePicker>
          <PriorityPicker value={priority} onChange={(p) => setManual((m) => ({ ...m, priority: p }))}>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 bg-card">
              {priority === "none" ? <Flag className="size-3.5" /> : <PriorityIcon priority={priority} />}
              {t(`priority.${priority}`)}
            </Button>
          </PriorityPicker>
          {parsed.recurrence && (
            <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium", CHIP_STYLE.repeat)}>
              <Repeat className="size-3.5" /> {recurrenceLabel(parsed.recurrence)}
            </span>
          )}
          {parsed.assigneeIds.map((id) => (
            <span key={id} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium", CHIP_STYLE.person)}>
              {profiles[id] ? <UserAvatar profile={profiles[id]} size={18} /> : <User className="size-3.5" />}
              {profiles[id]?.name}
            </span>
          ))}
          {top && (
            <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium", CHIP_STYLE.top)}>
              <Star className="size-3.5 fill-current" /> {t("quickAdd.chipTop")}
            </span>
          )}
          {parsed.unknownProject && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-warning-soft px-2 text-xs font-medium text-warning-fg">
              <AlertTriangle className="size-3.5" /> {t("quickAdd.unknownProject", { name: parsed.unknownProject })}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-muted/50 px-4 py-2.5">
          <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">{t("quickAdd.hint")}</p>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => submit(true)} disabled={!parsed.title} className="hidden sm:inline-flex">
              {t("quickAdd.addAnother")} <Kbd>⌘↵</Kbd>
            </Button>
            <Button size="sm" onClick={() => submit(false)} disabled={!parsed.title}>
              {t("quickAdd.add")}
            </Button>
          </div>
        </div>
        {dueDate && (
          <span className="sr-only" aria-live="polite">
            {capitalize(f.longDay(dueDate))} {dueTime ?? ""}
          </span>
        )}
      </DialogContent>
    </Dialog>
  );
}
