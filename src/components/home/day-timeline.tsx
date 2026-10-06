"use client";

import { AlarmClock, CalendarDays, CalendarSync, Moon, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { safeColor } from "@/lib/colors";
import { hhmmToMinutes, minutesOfDay, minutesToHHMM } from "@/lib/dates";
import type { Task, TimeBlock } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createTimeBlock, deleteTimeBlock, updateTimeBlock } from "@/store/actions";
import { useMe, useNowMinutes, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { useFixedItems } from "@/hooks/use-day-busy";
import { requestGoogleSync, useGoogleStatus } from "@/hooks/use-google";

const PX_PER_MIN = 0.8; // 48px per hour
const SNAP = 15;

export const TASK_DRAG_TYPE = "application/x-reja-task";

export function DayTimeline({ date, candidates }: { date: string; candidates: Task[] }) {
  const t = useTranslations();
  const tz = useTz();
  const uid = useUserId();
  const now = useNowMinutes();
  const blocks = useStore((s) => s.data.time_blocks);
  const tasks = useStore((s) => s.data.tasks);
  const projects = useStore((s) => s.data.projects);
  const openTask = useUI((s) => s.openTask);
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [drag, setDrag] = useState<{ id: string; y0: number; delta: number; mode: "move" | "resize" } | null>(null);
  const me = useMe();
  const { fixed, allDay } = useFixedItems(date);
  const google = useGoogleStatus();

  const items = useMemo(() => {
    const out: { id: string; kind: "block" | "task"; start: number; end: number; title: string; color: string; taskId?: string | null; block?: TimeBlock }[] = [];
    for (const b of Object.values(blocks)) {
      if (b.user_id !== uid || b.date !== date) continue;
      const task = b.task_id ? tasks[b.task_id] : undefined;
      out.push({
        id: b.id,
        kind: "block",
        start: minutesOfDay(tz, b.start_at),
        end: minutesOfDay(tz, b.end_at) || 24 * 60,
        title: b.title || task?.title || "—",
        color: b.color || (task?.project_id ? projects[task.project_id]?.color : null) || "sky",
        taskId: b.task_id,
        block: b,
      });
    }
    for (const task of candidates) {
      if (!task.due_at) continue;
      const start = minutesOfDay(tz, task.due_at);
      // a block planned for the task that covers its due time already shows it
      if (out.some((o) => o.taskId === task.id && o.start <= start && o.end > start)) continue;
      out.push({ id: `task-${task.id}`, kind: "task", start, end: start + (task.estimate_min ?? 30), title: task.title, color: projects[task.project_id ?? ""]?.color ?? "tangerine", taskId: task.id });
    }
    return out.sort((a, b) => a.start - b.start);
  }, [blocks, uid, date, tasks, tz, projects, candidates]);

  // the visible day comes from Settings (default 07:00–22:00) and grows to fit anything planned outside it
  const START = Math.min(Math.floor(hhmmToMinutes(me?.day_start ?? "07:00") / 60) * 60, ...items.map((i) => Math.floor(i.start / 60) * 60), ...fixed.filter((f) => f.kind === "event").map((f) => Math.floor(f.start / 60) * 60));
  const END = Math.max(Math.ceil(hhmmToMinutes(me?.day_end ?? "22:00") / 60) * 60, ...items.map((i) => Math.ceil(Math.min(i.end, 24 * 60) / 60) * 60), ...fixed.filter((f) => f.kind === "event").map((f) => Math.ceil(Math.min(f.end, 24 * 60) / 60) * 60));

  const minuteAt = (clientY: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const m = START + (clientY - rect.top) / PX_PER_MIN;
    return Math.max(START, Math.min(END - SNAP, Math.round(m / SNAP) * SNAP));
  };

  function addBlock(startMin: number, input: { taskId?: string; title?: string; minutes?: number }) {
    const dur = Math.max(SNAP, Math.min(240, input.minutes ?? 60));
    createTimeBlock({ date, start: minutesToHHMM(startMin), end: minutesToHHMM(Math.min(END, startMin + dur)), taskId: input.taskId ?? null, title: input.title ?? null });
  }

  function commitDrag() {
    if (!drag || drag.delta === 0) {
      setDrag(null);
      return;
    }
    const b = blocks[drag.id];
    if (b) {
      const shift = drag.delta * 60_000;
      if (drag.mode === "move") {
        updateTimeBlock(b.id, { start_at: new Date(Date.parse(b.start_at) + shift).toISOString(), end_at: new Date(Date.parse(b.end_at) + shift).toISOString() });
      } else {
        const end = Math.max(Date.parse(b.start_at) + SNAP * 60_000, Date.parse(b.end_at) + shift);
        updateTimeBlock(b.id, { end_at: new Date(end).toISOString() });
      }
      if (b.sync_google) requestGoogleSync();
    }
    setDrag(null);
  }

  const hours = [];
  for (let m = START; m <= END; m += 60) hours.push(m);

  return (
    <>
    {allDay.length > 0 && (
      <ul className="mb-2 ml-11 flex flex-wrap gap-1" aria-label={t("calendarSync.allDay")}>
        {allDay.map((e) => (
          <li key={e.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
            <CalendarDays className="size-3" /> {e.title || t("calendarSync.busy")}
          </li>
        ))}
      </ul>
    )}
    <div
      className="relative select-none"
      onPointerMove={(e) => {
        if (!drag) return;
        const delta = Math.round((e.clientY - drag.y0) / PX_PER_MIN / SNAP) * SNAP;
        if (delta !== drag.delta) setDrag({ ...drag, delta });
      }}
      onPointerUp={commitDrag}
      onPointerCancel={() => setDrag(null)}
    >
      <div
        ref={ref}
        role="list"
        aria-label={t("home.timeline")}
        className="relative ml-11"
        style={{ height: (END - START) * PX_PER_MIN }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
          e.preventDefault();
          setOver(minuteAt(e.clientY));
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
          setOver(null);
          if (!id) return;
          e.preventDefault();
          addBlock(minuteAt(e.clientY), { taskId: id, minutes: tasks[id]?.estimate_min ?? 60 });
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          setAdding(minuteAt(e.clientY));
          setTitle("");
        }}
      >
        {hours.map((m) => (
          <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/80" style={{ top: (m - START) * PX_PER_MIN }}>
            <span className="absolute -top-2 -left-11 w-9 text-right text-2xs text-muted-foreground tnum">{minutesToHHMM(m)}</span>
          </div>
        ))}
        {now >= START && now <= END && (
          <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (now - START) * PX_PER_MIN }}>
            <span className="-ml-1.5 size-3 rounded-full bg-destructive" />
            <span className="h-0.5 flex-1 bg-destructive" />
          </div>
        )}
        {over !== null && (
          <div className="pointer-events-none absolute inset-x-1 z-10 rounded-lg border-2 border-dashed border-brand bg-brand-soft/60" style={{ top: (over - START) * PX_PER_MIN, height: 60 * PX_PER_MIN }} />
        )}
        {fixed.map((f) => {
          if (f.end <= START || f.start >= END) return null;
          const top = (Math.max(START, f.start) - START) * PX_PER_MIN;
          const height = Math.max(14, (Math.min(END, f.end) - Math.max(START, f.start)) * PX_PER_MIN - 2);
          const label = f.kind === "prayer" ? t(`prayer.names.${f.prayer}`) : f.title || t("calendarSync.busy");
          return (
            <div
              key={f.id}
              role="listitem"
              data-kind={f.kind}
              aria-label={`${minutesToHHMM(f.start)} ${label}${f.kind === "event" ? ` · ${t("calendarSync.fromGoogle")}` : ""}`}
              style={{ top, height }}
              className={cn(
                "pointer-events-none absolute inset-x-1 z-[5] overflow-hidden rounded-lg px-2 py-0.5 text-2xs",
                f.kind === "prayer"
                  ? "border border-success/40 bg-success-soft/60 text-success-fg"
                  : "border border-dashed border-border-strong bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)] text-muted-foreground",
              )}
            >
              <span className="flex items-center gap-1 truncate font-medium">
                {f.kind === "prayer" ? <Moon className="size-3 shrink-0" aria-hidden /> : <CalendarDays className="size-3 shrink-0" aria-hidden />}
                <span className="tnum">{minutesToHHMM(f.start)}</span> {label}
              </span>
            </div>
          );
        })}
        {items.map((it) => {
          const d = drag?.id === it.id ? drag : null;
          const start = it.start + (d?.mode === "move" ? d.delta : 0);
          const end = it.end + (d ? d.delta : 0);
          const top = (Math.max(START, start) - START) * PX_PER_MIN;
          const height = Math.max(18, (Math.min(END, end) - Math.max(START, start)) * PX_PER_MIN - 2);
          return (
            <div
              key={it.id}
              role="listitem"
              data-color={safeColor(it.color)}
              style={{ top, height }}
              onPointerDown={(e) => {
                if (it.kind !== "block") return;
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                setDrag({ id: it.id, y0: e.clientY, delta: 0, mode: "move" });
              }}
              onClick={() => !drag && it.taskId && openTask(it.taskId)}
              className={cn(
                "absolute inset-x-1 z-10 overflow-hidden rounded-lg border-l-[3px] border-pc px-2 py-1 text-xs shadow-elev-1",
                it.kind === "block" ? "cursor-grab bg-pc-soft text-pc-fg active:cursor-grabbing" : "border-dashed bg-card text-foreground",
                d && "shadow-elev-3",
              )}
            >
              <p className="flex items-center gap-1 truncate font-semibold">
                {it.kind === "task" ? <AlarmClock className="size-3 shrink-0" aria-label={t("home.timelineDue")} /> : null}
                <span className="shrink-0 font-normal opacity-80 tnum">{it.kind === "task" ? minutesToHHMM(start) : `${minutesToHHMM(start)}–${minutesToHHMM(end)}`}</span>
                <span className="truncate">{it.title}</span>
              </p>
              {height > 30 && <p className="text-2xs opacity-75">{it.kind === "task" ? t("home.timelineDue") : t("home.timelineBlock")}</p>}
              {it.kind === "block" && (
                <>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTimeBlock(it.id);
                      if (it.block?.sync_google) requestGoogleSync();
                    }}
                    aria-label={t("home.timelineDeleteBlock", { title: it.title })}
                    className="absolute top-1 right-1 rounded p-0.5 opacity-0 hover:bg-black/10 focus-visible:opacity-100 [div:hover>&]:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Trash2 className="size-3" />
                  </button>
                  {google?.connected && it.block && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateTimeBlock(it.id, { sync_google: !it.block!.sync_google });
                        requestGoogleSync(300);
                      }}
                      aria-pressed={it.block.sync_google}
                      aria-label={t("calendarSync.blockToggle", { title: it.title })}
                      className={cn(
                        "absolute top-1 right-6 rounded p-0.5 hover:bg-black/10 focus-visible:opacity-100",
                        it.block.sync_google ? "opacity-100" : "opacity-0 [div:hover>&]:opacity-100 [@media(hover:none)]:opacity-100",
                      )}
                    >
                      <CalendarSync className="size-3" />
                    </button>
                  )}
                  <span
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      setDrag({ id: it.id, y0: e.clientY, delta: 0, mode: "resize" });
                    }}
                    className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                  />
                </>
              )}
            </div>
          );
        })}
        <Popover open={adding !== null} onOpenChange={(o) => !o && setAdding(null)}>
          <PopoverAnchor asChild>
            <span className="absolute left-1/2" style={{ top: ((adding ?? START) - START) * PX_PER_MIN }} />
          </PopoverAnchor>
          <PopoverContent className="w-64 space-y-2 p-2">
            <p className="text-xs font-semibold text-muted-foreground tnum">{adding !== null && minutesToHHMM(adding)}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (adding !== null && title.trim()) addBlock(adding, { title: title.trim() });
                setAdding(null);
              }}
            >
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("task.titlePlaceholder")} className="h-8" />
            </form>
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {candidates.slice(0, 12).map((task) => (
                <button
                  key={task.id}
                  onClick={() => {
                    if (adding !== null) addBlock(adding, { taskId: task.id, minutes: task.estimate_min ?? 60 });
                    setAdding(null);
                  }}
                  className="block w-full truncate rounded px-2 py-1 text-left text-13 hover:bg-muted"
                >
                  {task.title}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setAdding(null)}>
              {t("common.cancel")}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
    </>
  );
}
