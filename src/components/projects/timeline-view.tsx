"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { safeColor } from "@/lib/colors";
import { addDays, diffDays, eachDay, isoWeekday, parseISODate, startOfWeek, timeIn, zonedToUtc } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import type { Section, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { updateTask } from "@/store/actions";
import { useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";

const ROW = 38;
const PX: Record<"day" | "week" | "month", number> = { day: 40, week: 18, month: 6 };

interface Drag {
  id: string;
  mode: "move" | "start" | "end";
  x0: number;
  delta: number;
}

export function TimelineView({ tasks, sections, writable, color }: { tasks: Task[]; sections: Section[]; writable: boolean; color: string }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const openTask = useUI((s) => s.openTask);
  const deps = useStore((s) => s.data.task_dependencies);
  const [zoom, setZoom] = useState<"day" | "week" | "month">("week");
  const [drag, setDrag] = useState<Drag | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const px = PX[zoom];

  const rows = useMemo(() => {
    const order = new Map(sections.map((s, i) => [s.id, i]));
    return tasks
      .filter((x) => x.start_date || x.due_date)
      .sort((a, b) => (order.get(a.section_id ?? "") ?? -1) - (order.get(b.section_id ?? "") ?? -1) || (a.start_date ?? a.due_date!).localeCompare(b.start_date ?? b.due_date!));
  }, [tasks, sections]);
  const undated = useMemo(() => tasks.filter((x) => !x.start_date && !x.due_date && x.status !== "done"), [tasks]);

  const [from, to] = useMemo(() => {
    let lo = addDays(today, -14);
    let hi = addDays(today, 56);
    for (const r of rows) {
      const s = r.start_date ?? r.due_date!;
      const e = r.due_date ?? r.start_date!;
      if (s < lo) lo = s;
      if (e > hi) hi = e;
    }
    return [startOfWeek(addDays(lo, -7)), addDays(hi, 21)];
  }, [rows, today]);
  const days = useMemo(() => eachDay(from, to), [from, to]);
  const width = days.length * px;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, diffDays(from, today) * px - el.clientWidth / 3);
  }, [from, px, today]);

  const span = (task: Task) => {
    let s = task.start_date ?? task.due_date!;
    let e = task.due_date ?? task.start_date!;
    if (drag?.id === task.id) {
      if (drag.mode === "move" || drag.mode === "start") s = addDays(s, drag.delta);
      if (drag.mode === "move" || drag.mode === "end") e = addDays(e, drag.delta);
      if (s > e) [s, e] = drag.mode === "start" ? [e, e] : [s, s];
    }
    return { s, e, left: diffDays(from, s) * px, w: (diffDays(s, e) + 1) * px };
  };

  function onPointerDown(e: React.PointerEvent, task: Task, mode: Drag["mode"]) {
    if (!writable) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: task.id, mode, x0: e.clientX, delta: 0 });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.x0) / px);
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  }
  function onPointerUp() {
    if (!drag) return;
    const task = rows.find((r) => r.id === drag.id);
    if (task && drag.delta !== 0) {
      const { s, e } = span(task);
      const hasStart = Boolean(task.start_date);
      const hasDue = Boolean(task.due_date);
      const values: Partial<Task> = {};
      if (hasStart || drag.mode === "start") values.start_date = s;
      if (hasDue || drag.mode === "end") values.due_date = e;
      if (values.due_date && task.due_at && values.due_date !== task.due_date) {
        values.due_at = zonedToUtc(values.due_date, timeIn(tz, task.due_at), tz).toISOString();
      }
      updateTask(task.id, values);
    } else if (task && drag.delta === 0 && drag.mode === "move") {
      openTask(task.id);
    }
    setDrag(null);
  }

  const months = useMemo(() => {
    const out: { label: string; left: number; w: number }[] = [];
    for (const d of days) {
      const key = d.slice(0, 7);
      const last = out.at(-1);
      if (!last || last.label !== key) out.push({ label: key, left: diffDays(from, d) * px, w: px });
      else last.w += px;
    }
    return out.map((m) => {
      const dt = parseISODate(`${m.label}-01`);
      return { ...m, label: `${f.months[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` };
    });
  }, [days, from, px, f.months]);

  if (rows.length === 0 && undated.length === 0) {
    return <EmptyState illustration="calendar" title={t("empty.timelineEmpty")} />;
  }

  const index = new Map(rows.map((r, i) => [r.id, i]));
  const lines = Object.values(deps)
    .filter((d) => index.has(d.blocker_id) && index.has(d.blocked_id))
    .map((d) => {
      const a = rows[index.get(d.blocker_id)!];
      const b = rows[index.get(d.blocked_id)!];
      const sa = span(a);
      const sb = span(b);
      const x1 = sa.left + sa.w;
      const y1 = index.get(a.id)! * ROW + ROW / 2;
      const x2 = sb.left;
      const y2 = index.get(b.id)! * ROW + ROW / 2;
      const mid = Math.max(x1 + 10, Math.min(x2 - 10, (x1 + x2) / 2));
      return { key: `${d.blocker_id}-${d.blocked_id}`, path: `M${x1},${y1} H${mid} V${y2} H${x2 - 2}`, late: x2 < x1 };
    });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ToggleGroup type="single" value={zoom} onValueChange={(v) => v && setZoom(v as typeof zoom)} variant="outline" size="sm">
          <ToggleGroupItem value="day">{t("timeline.zoomDay")}</ToggleGroupItem>
          <ToggleGroupItem value="week">{t("timeline.zoomWeek")}</ToggleGroupItem>
          <ToggleGroupItem value="month">{t("timeline.zoomMonth")}</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex overflow-hidden rounded-2xl border bg-card shadow-elev-1">
        <div className="w-44 shrink-0 border-r sm:w-60">
          <div className="h-12 border-b bg-muted/50" />
          {rows.map((r) => (
            <button key={r.id} onClick={() => openTask(r.id)} style={{ height: ROW }} className="flex w-full items-center truncate border-b px-3 text-left text-13 hover:bg-muted/60">
              <span className={cn("truncate", r.status === "done" && "text-muted-foreground line-through")}>{r.title}</span>
            </button>
          ))}
        </div>
        <div ref={scrollRef} className="relative flex-1 overflow-x-auto" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
          <div style={{ width }} className="relative">
            <div className="sticky top-0 z-10 h-12 border-b bg-muted/50">
              {months.map((m) => (
                <div key={m.label + m.left} style={{ left: m.left, width: m.w }} className="absolute top-0 truncate border-l px-2 pt-1 text-xs font-semibold capitalize">
                  {m.label}
                </div>
              ))}
              {zoom !== "month" &&
                days.map((d, i) =>
                  zoom === "day" || isoWeekday(d) === 1 ? (
                    <div key={d} style={{ left: i * px, width: zoom === "day" ? px : px * 7 }} className="absolute bottom-0 h-5 border-l text-center text-2xs text-muted-foreground tnum">
                      {Number(d.slice(8))}
                    </div>
                  ) : null,
                )}
            </div>
            <div className="relative" style={{ height: rows.length * ROW }}>
              {/* weekend shading and today line */}
              {zoom !== "month" &&
                days.map((d, i) => (isoWeekday(d) >= 6 ? <div key={d} style={{ left: i * px, width: px }} className="absolute inset-y-0 bg-muted/40" /> : null))}
              <div style={{ left: diffDays(from, today) * px + px / 2 }} className="absolute inset-y-0 z-10 w-0.5 bg-brand" aria-label={t("timeline.today")} />
              {rows.map((_, i) => (
                <div key={i} style={{ top: (i + 1) * ROW - 1 }} className="absolute inset-x-0 h-px bg-border/70" />
              ))}
              <svg className="pointer-events-none absolute inset-0 z-10" width={width} height={rows.length * ROW}>
                <defs>
                  <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,0 L8,4 L0,8 z" fill="var(--muted-foreground)" />
                  </marker>
                </defs>
                {lines.map((l) => (
                  <path key={l.key} d={l.path} fill="none" stroke={l.late ? "var(--destructive)" : "var(--muted-foreground)"} strokeWidth="1.5" markerEnd="url(#arrow)" />
                ))}
              </svg>
              {rows.map((r, i) => {
                const { left, w } = span(r);
                const done = r.status === "done";
                return (
                  <div
                    key={r.id}
                    data-color={safeColor(color)}
                    style={{ left, width: Math.max(w, px), top: i * ROW + 7, height: ROW - 14 }}
                    onPointerDown={(e) => onPointerDown(e, r, "move")}
                    className={cn(
                      "group absolute z-20 flex items-center overflow-hidden rounded-md bg-pc px-2 text-xs font-medium text-white shadow-elev-1 select-none",
                      writable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                      done && "opacity-50",
                      drag?.id === r.id && "shadow-elev-3 ring-2 ring-white/60",
                    )}
                    title={r.title}
                  >
                    {writable && <span onPointerDown={(e) => onPointerDown(e, r, "start")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-white/30" />}
                    <span className="truncate">{w > 60 ? r.title : ""}</span>
                    {writable && <span onPointerDown={(e) => onPointerDown(e, r, "end")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-white/30" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {undated.length > 0 && (
        <div className="rounded-2xl border bg-card p-3 shadow-elev-1">
          <p className="mb-2 text-13 font-semibold">{t("timeline.noDates")}</p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((u) => (
              <button key={u.id} onClick={() => openTask(u.id)} className="rounded-md border bg-muted/40 px-2 py-1 text-xs hover:bg-muted">
                {u.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
