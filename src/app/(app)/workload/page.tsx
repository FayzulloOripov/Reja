"use client";

import { AlertTriangle, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useMemo, useState } from "react";
import { PageHeader, UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addDays, eachDay, isoWeekday, startOfWeek } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import { isOpen } from "@/lib/health";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { assigneesByTask, useCurrentWorkspace, useMembers, useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";

const CAP_DAY = 6;
const CAP_WEEK = 25;

function WorkloadInner() {
  const t = useTranslations();
  const params = useSearchParams();
  const highlight = params.get("person");
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const ws = useCurrentWorkspace();
  const members = useMembers(ws?.id);
  const tasks = useStore((s) => s.data.tasks);
  const projects = useStore((s) => s.data.projects);
  const assignees = useStore((s) => s.data.task_assignees);
  const openTask = useUI((s) => s.openTask);
  const [mode, setMode] = useState<"day" | "week">("day");

  const columns = useMemo(() => {
    if (mode === "day") return eachDay(today, addDays(today, 13)).map((d) => ({ key: d, from: d, to: d }));
    const start = startOfWeek(today);
    return Array.from({ length: 6 }, (_, i) => ({ key: addDays(start, i * 7), from: addDays(start, i * 7), to: addDays(start, i * 7 + 6) }));
  }, [mode, today]);

  const grid = useMemo(() => {
    const by = assigneesByTask(assignees);
    const open = Object.values(tasks).filter((x) => !x.deleted_at && isOpen(x) && x.due_date && x.workspace_id === ws?.id && x.project_id && projects[x.project_id] && !projects[x.project_id].deleted_at);
    const rows = [...members.map((m) => ({ id: m.id, profile: m })), { id: "none", profile: null }];
    return rows
      .map((r) => {
        const mine = open.filter((x) => {
          const ids = (by[x.id] ?? []).map((a) => a.user_id);
          return r.id === "none" ? ids.length === 0 : ids.includes(r.id);
        });
        const cells = columns.map((c) => {
          const list = mine.filter((x) => {
            const d = x.due_date!;
            // overdue work lands in the first column
            return (d >= c.from && d <= c.to) || (c === columns[0] && d < c.from);
          });
          return { key: c.key, list };
        });
        return { ...r, cells, total: cells.reduce((n, c) => n + c.list.length, 0) };
      })
      .filter((r) => r.total > 0 || r.id !== "none");
  }, [assignees, tasks, ws?.id, projects, members, columns]);

  const cap = mode === "day" ? CAP_DAY : CAP_WEEK;
  const max = Math.max(1, ...grid.flatMap((r) => r.cells.map((c) => c.list.length)));

  return (
    <PageContainer wide>
      <PageHeader
        title={t("workload.title")}
        subtitle={t("workload.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-info-soft text-info-fg"><Users className="size-5" /></span>}
        actions={
          <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as "day" | "week")} variant="outline" size="sm">
            <ToggleGroupItem value="day">{t("workload.perDay")}</ToggleGroupItem>
            <ToggleGroupItem value="week">{t("workload.perWeek")}</ToggleGroupItem>
          </ToggleGroup>
        }
      />
      <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="size-3.5 text-destructive" /> {t("workload.capacity", { count: cap })}
      </p>
      {grid.every((r) => r.total === 0) ? (
        <EmptyState illustration="team" title={t("workload.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-elev-1">
          <table className="w-full min-w-[760px] border-collapse text-13">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className="sticky left-0 z-10 w-48 bg-muted/50 px-3 py-2 text-left text-xs font-semibold text-muted-foreground backdrop-blur">{t("common.members")}</th>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={cn("px-1 py-2 text-center text-2xs font-semibold text-muted-foreground", mode === "day" && isoWeekday(c.key) >= 6 && "text-subtle-foreground")}>
                    {mode === "day" ? (
                      <>
                        <span className="block">{f.weekdaysShort[isoWeekday(c.key) - 1]}</span>
                        <span className={cn("block tnum", c.key === today && "text-brand-fg")}>{Number(c.key.slice(8))}</span>
                      </>
                    ) : (
                      <span className="tnum">{f.dayMonth(c.from)}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {grid.map((r) => (
                <tr key={r.id} className={cn(highlight === r.id && "bg-brand-soft/40")}>
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">
                    <span className="flex items-center gap-2">
                      {r.profile ? <UserAvatar profile={r.profile} size={24} /> : <span className="size-6 rounded-full border border-dashed" />}
                      <span className="truncate">{r.profile?.name ?? t("workload.unassigned")}</span>
                      <span className="ml-auto text-xs text-muted-foreground tnum">{r.total}</span>
                    </span>
                  </th>
                  {r.cells.map((c) => {
                    const n = c.list.length;
                    const over = n > cap;
                    return (
                      <td key={c.key} className="p-1 text-center">
                        {n === 0 ? (
                          <span className="block h-9 rounded-md" />
                        ) : (
                          <CellPopover list={c.list} onOpen={openTask}>
                            <button
                              aria-label={`${r.profile?.name ?? t("workload.unassigned")}: ${n}${over ? `, ${t("workload.overloaded")}` : ""}`}
                              className={cn(
                                "flex h-9 w-full items-center justify-center gap-1 rounded-md text-xs font-semibold tnum transition-transform hover:scale-105",
                                over ? "bg-destructive text-white" : "text-foreground",
                              )}
                              style={over ? undefined : { background: `color-mix(in oklch, var(--chart-2) ${Math.round(15 + (n / max) * 55)}%, transparent)` }}
                            >
                              {over && <AlertTriangle className="size-3" />}
                              {n}
                            </button>
                          </CellPopover>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}

function CellPopover({ list, onOpen, children }: { list: Task[]; onOpen: (id: string) => void; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-1">
        <ul>
          {list.map((x) => (
            <li key={x.id}>
              <button onClick={() => onOpen(x.id)} className="block w-full truncate rounded-md px-2 py-1.5 text-left text-13 hover:bg-muted">
                {x.title}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export default function WorkloadPage() {
  return (
    <Suspense>
      <WorkloadInner />
    </Suspense>
  );
}
