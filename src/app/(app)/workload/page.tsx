"use client";

import { AlertTriangle, Users } from "lucide-react";
import Link from "next/link";
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
import type { Task } from "@/lib/types";
import { DEFAULT_CAPACITY_TASKS, workloadGrid } from "@/lib/workload";
import { cn } from "@/lib/utils";
import { assigneesByTask, useCurrentWorkspace, useMembers, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";

function WorkloadInner() {
  const t = useTranslations();
  const params = useSearchParams();
  const highlight = params.get("person");
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const uid = useUserId();
  const ws = useCurrentWorkspace();
  const members = useMembers(ws?.id);
  const tasks = useStore((s) => s.data.tasks);
  const assignees = useStore((s) => s.data.task_assignees);
  const openTask = useUI((s) => s.openTask);
  const [mode, setMode] = useState<"day" | "week">("day");

  const columns = useMemo(() => {
    if (mode === "day") return eachDay(today, addDays(today, 13)).map((d) => ({ key: d, from: d, to: d }));
    const start = startOfWeek(today);
    return Array.from({ length: 6 }, (_, i) => ({ key: addDays(start, i * 7), from: addDays(start, i * 7), to: addDays(start, i * 7 + 6) }));
  }, [mode, today]);

  const grid = useMemo(() => {
    const wsTasks = Object.values(tasks).filter((x) => x.workspace_id === ws?.id);
    const rows = workloadGrid({ tasks: wsTasks, assignees: assigneesByTask(assignees), people: members, columns });
    return rows.map((r) => ({ ...r, profile: members.find((m) => m.id === r.id)! }));
  }, [assignees, tasks, ws?.id, members, columns]);

  const max = Math.max(1, ...grid.flatMap((r) => r.cells.map((c) => c.tasks.length)));
  const me = members.find((m) => m.id === uid);

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
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="size-3.5 text-destructive" aria-hidden /> {t("workload.overLegend")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-[repeating-linear-gradient(135deg,var(--muted)_0_3px,transparent_3px_6px)] ring-1 ring-border" aria-hidden /> {t("workload.dayOffLegend")}
        </span>
        <span>{t("workload.ownerRule")}</span>
        {me && (
          <Link href="/settings/profile" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("workload.myCapacity", { count: me.daily_capacity_tasks ?? DEFAULT_CAPACITY_TASKS })}
          </Link>
        )}
      </div>
      {grid.every((r) => r.total === 0) ? (
        <EmptyState illustration="team" title={t("workload.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-elev-1">
          <table className="w-full min-w-[760px] border-collapse text-13">
            <thead>
              <tr className="border-b bg-muted/50">
                <th scope="col" className="sticky left-0 z-10 w-48 bg-muted/50 px-3 py-2 text-left text-xs font-semibold text-muted-foreground backdrop-blur">{t("common.members")}</th>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className="px-1 py-2 text-center text-2xs font-semibold text-muted-foreground">
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
                      <UserAvatar profile={r.profile} size={24} />
                      <span className="truncate" title={r.profile.name}>{r.profile.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground tnum">{r.total}</span>
                    </span>
                  </th>
                  {r.cells.map((c) => {
                    const n = c.tasks.length;
                    const label = [
                      `${r.profile.name}: ${t("workload.cellTasks", { count: n })}`,
                      c.minutes ? f.duration(c.minutes) : null,
                      c.dayOff ? t("workload.dayOff") : t("workload.capacityOf", { count: c.capacityTasks }),
                      c.over ? t("workload.overloaded") : null,
                    ]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <td key={c.key} className="p-1 text-center">
                        {n === 0 ? (
                          <span
                            className={cn("block h-9 rounded-md", c.dayOff && "bg-[repeating-linear-gradient(135deg,var(--muted)_0_3px,transparent_3px_6px)]")}
                            aria-label={c.dayOff ? `${r.profile.name}: ${t("workload.dayOff")}` : undefined}
                          />
                        ) : (
                          <CellPopover list={c.tasks} onOpen={openTask}>
                            <button
                              aria-label={label}
                              title={label}
                              className={cn(
                                "flex h-9 w-full items-center justify-center gap-1 rounded-md text-xs font-semibold tnum transition-transform hover:scale-105",
                                c.over ? "bg-destructive text-white" : "text-foreground",
                              )}
                              style={c.over ? undefined : { background: `color-mix(in oklch, var(--chart-2) ${Math.round(15 + (n / max) * 55)}%, transparent)` }}
                            >
                              {c.over && <AlertTriangle className="size-3" aria-hidden />}
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
