"use client";

import { BarChart3, CheckCircle2, Clock, Gauge } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, barProps, ChartCard, ChartTooltip, gridProps, hbarProps, lineProps, SLOT, StatTile } from "@/components/charts/kit";
import { PageHeader, ProjectDot } from "@/components/common/bits";
import { AreaFilterChips, inArea, useAreaFilter, type AreaFilterValue } from "@/components/projects/area-filter";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { colorVar } from "@/lib/colors";
import { useFormat } from "@/lib/format";
import { isOverdue } from "@/lib/health";
import { responsibleIds } from "@/lib/tasks/responsible";
import { completedPerWeek, createdVsCompleted, lastWeeks, minutesByKey, onTimeRate, overdueTrend, progressOverTime } from "@/lib/reports";
import { assigneesByTask, tasksByProject, useAreas, useMyTasks, useProjects, useProfiles, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

export default function ReportsPage() {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const uid = useUserId();
  const [range, setRange] = useState(12);
  const areas = useAreas();
  const [area, setArea] = useAreaFilter("reports");
  const weeks = useMemo(() => lastWeeks(today, range), [today, range]);
  const weekLabel = (w: string | number) => f.dayMonth(String(w));

  return (
    <PageContainer wide>
      <PageHeader
        title={t("reports.title")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-[var(--pc-violet-soft)] text-[var(--pc-violet-fg)]"><BarChart3 className="size-5" /></span>}
      />
      <Tabs defaultValue="personal">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="personal">{t("reports.personal")}</TabsTrigger>
            <TabsTrigger value="project">{t("reports.project")}</TabsTrigger>
          </TabsList>
          <AreaFilterChips areas={areas} value={area} onChange={setArea} />
          <ToggleGroup type="single" value={String(range)} onValueChange={(v) => v && setRange(Number(v))} variant="outline" size="sm" aria-label={t("reports.week")}>
            {[4, 8, 12, 16].map((n) => (
              <ToggleGroupItem key={n} value={String(n)}>{t("reports.weeks", { count: n })}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <TabsContent value="personal">
          <Personal weeks={weeks} tz={tz} uid={uid} weekLabel={weekLabel} area={area} />
        </TabsContent>
        <TabsContent value="project">
          <ProjectReport weeks={weeks} tz={tz} weekLabel={weekLabel} today={today} area={area} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function Personal({ weeks, tz, uid, weekLabel, area }: { weeks: ReturnType<typeof lastWeeks>; tz: string; uid: string; weekLabel: (w: string | number) => string; area: AreaFilterValue }) {
  const t = useTranslations();
  const today = useToday();
  const f = useFormat(today, tz);
  const allMine = useMyTasks();
  const projectsById = useStore((s) => s.data.projects);
  const mine = useMemo(() => allMine.filter((x) => inArea(x, projectsById, area)), [allMine, projectsById, area]);
  const tasks = useStore((s) => s.data.tasks);
  const entries = useStore((s) => s.data.time_entries);
  const projects = useProjects(undefined, { includeArchived: true });

  const completed = useMemo(() => completedPerWeek(mine, weeks, tz), [mine, weeks, tz]);
  const onTime = useMemo(() => onTimeRate(mine, weeks, tz), [mine, weeks, tz]);
  const overdue = useMemo(() => overdueTrend(mine, weeks, tz), [mine, weeks, tz]);
  const time = useMemo(() => {
    const myEntries = Object.values(entries).filter((e) => e.user_id === uid && (area === "all" || (e.task_id ? Boolean(tasks[e.task_id]) && inArea(tasks[e.task_id], projectsById, area) : area === "none")));
    return minutesByKey(myEntries, (taskId) => (taskId ? (tasks[taskId]?.project_id ?? "inbox") : "no-task"), weeks[0].start, tz).map(([pid, minutes]) => ({
      id: pid,
      name: pid === "inbox" ? t("nav.inbox") : pid === "no-task" ? t("reports.focusNoTask") : (projects.find((p) => p.id === pid)?.name ?? "…"),
      color: projects.find((p) => p.id === pid)?.color ?? null,
      minutes,
    }));
  }, [entries, uid, tasks, weeks, tz, projects, t, area, projectsById]);

  const total = completed.reduce((n, w) => n + w.count, 0);
  // every number on the page covers the selected period
  const rated = onTime.reduce((acc, w) => ({ onTime: acc.onTime + (w.onTime ?? 0), total: acc.total + (w.rate === null ? 0 : w.total) }), { onTime: 0, total: 0 });
  const rate = rated.total ? Math.round((rated.onTime / rated.total) * 100) : null;
  const period = t("reports.lastWeeks", { count: weeks.length });
  const maxMinutes = Math.max(0, ...time.map((r) => r.minutes));
  const timeTicks = timeAxisTicks(maxMinutes);
  const totalMinutes = time.reduce((n, r) => n + r.minutes, 0);

  if (total === 0 && totalMinutes === 0) return <EmptyState illustration="chart" title={t("reports.noData")} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<CheckCircle2 className="text-success" />} label={t("reports.totalDone")} value={f.num(total)} hint={period} />
        <StatTile icon={<BarChart3 />} label={t("reports.avgPerWeek")} value={f.num(total / weeks.length, Math.round((total / weeks.length) * 10) % 10 === 0 ? 0 : 1)} hint={period} />
        <StatTile icon={<Gauge />} label={t("reports.onTimeRate")} value={rate === null ? "—" : `${f.num(rate)}%`} hint={period} />
        <StatTile icon={<Clock />} label={t("reports.focusTime")} value={f.duration(totalMinutes)} hint={period} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("reports.completedPerWeek")}
          csvName="completed-per-week"
          table={{ columns: [{ key: "week", label: t("reports.week") }, { key: "count", label: t("reports.completed"), numeric: true }], rows: completed.map((w) => ({ week: w.week, count: w.count })) }}
        >
          <ResponsiveContainer>
            <BarChart data={completed} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="week" tickFormatter={weekLabel} {...axisProps} minTickGap={12} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip labelFormat={weekLabel} />} />
              <Bar dataKey="count" name={t("reports.completed")} fill={SLOT[0]} {...barProps} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={t("reports.onTimeRate")}
          csvName="on-time-rate"
          table={{ columns: [{ key: "week", label: t("reports.week") }, { key: "rate", label: t("reports.rate"), numeric: true }, { key: "total", label: t("reports.completed"), numeric: true }], rows: onTime.map((w) => ({ week: w.week, rate: w.rate === null ? "—" : `${w.rate}%`, total: w.total })) }}
        >
          <ResponsiveContainer>
            <LineChart data={onTime} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="week" tickFormatter={weekLabel} {...axisProps} minTickGap={12} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axisProps} />
              <Tooltip cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} content={<ChartTooltip labelFormat={weekLabel} format={(v) => `${v}%`} />} />
              <Line dataKey="rate" name={t("reports.rate")} stroke={SLOT[0]} connectNulls {...lineProps} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={t("reports.overdueTrend")}
          csvName="overdue-trend"
          table={{ columns: [{ key: "week", label: t("reports.week") }, { key: "count", label: t("reports.overdue"), numeric: true }], rows: overdue.map((w) => ({ week: w.week, count: w.count })) }}
        >
          <ResponsiveContainer>
            <AreaChart data={overdue} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="week" tickFormatter={weekLabel} {...axisProps} minTickGap={12} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} content={<ChartTooltip labelFormat={weekLabel} />} />
              <Area dataKey="count" name={t("reports.overdue")} stroke={SLOT[0]} fill={SLOT[0]} fillOpacity={0.1} {...lineProps} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={t("reports.timeByProject")}
          subtitle={period}
          csvName="time-by-project"
          height={Math.max(160, time.length * 34)}
          table={{ columns: [{ key: "name", label: t("task.project") }, { key: "minutes", label: t("reports.minutes"), numeric: true }], rows: time.map((r) => ({ name: r.name, minutes: r.minutes })) }}
        >
          {time.length === 0 ? (
            <p className="py-10 text-center text-13 text-muted-foreground">{t("reports.noData")}</p>
          ) : (
            <ResponsiveContainer>
              <BarChart data={time} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" ticks={timeTicks} domain={[0, timeTicks[timeTicks.length - 1]]} tickFormatter={(v: number) => f.hoursTick(v)} {...axisProps} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  {...axisProps}
                  tick={(props: { y?: number | string; payload?: { value?: string | number; index?: number } }) => {
                    const row = time[props.payload?.index ?? 0];
                    return (
                      <foreignObject x={0} y={Number(props.y ?? 0) - 10} width={128} height={20}>
                        <div className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                          <ProjectDot color={row?.color ?? "sky"} size="sm" />
                          <span className="truncate">{props.payload?.value}</span>
                        </div>
                      </foreignObject>
                    );
                  }}
                />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip format={(v) => f.duration(v)} />} />
                <Bar dataKey="minutes" name={t("reports.minutes")} fill={SLOT[0]} {...hbarProps}>
                  {/* each bar in its project's colour, matching the dot beside its name */}
                  {time.map((r) => (
                    <Cell key={r.name} fill={colorVar(r.color)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

/** Axis ticks for durations at round steps (15/30 min, 1/2/5 h…), so ticks read as time, not raw minutes. */
function timeAxisTicks(max: number): number[] {
  const steps = [15, 30, 60, 120, 180, 300, 600, 1200, 3000];
  const step = steps.find((s) => max / s <= 5) ?? 6000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}

function ProjectReport({ weeks, tz, weekLabel, today, area }: { weeks: ReturnType<typeof lastWeeks>; tz: string; weekLabel: (w: string | number) => string; today: string; area: AreaFilterValue }) {
  const t = useTranslations();
  const allProjects = useProjects(undefined, { includeArchived: true });
  const projects = useMemo(() => allProjects.filter((p) => area === "all" || (area === "none" ? !p.area_id : p.area_id === area)), [allProjects, area]);
  const [pid, setPid] = useState<string | null>(null);
  const projectId = (pid && projects.some((p) => p.id === pid) ? pid : projects[0]?.id) ?? null;
  const tasks = useStore((s) => s.data.tasks);
  const assignees = useStore((s) => s.data.task_assignees);
  const profiles = useProfiles();
  const list = useMemo(() => (projectId ? (tasksByProject(tasks)[projectId] ?? []).filter((x) => !x.parent_id) : []), [tasks, projectId]);
  const progress = useMemo(() => progressOverTime(list, weeks, tz), [list, weeks, tz]);
  const cvc = useMemo(() => createdVsCompleted(list, weeks, tz), [list, weeks, tz]);
  const byAssignee = useMemo(() => {
    const by = assigneesByTask(assignees);
    const counts = new Map<string, number>();
    for (const x of list) {
      if (!isOverdue(x, today)) continue;
      const ids = responsibleIds(x, by);
      for (const id of ids.length ? ids : ["none"]) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()].map(([id, count]) => ({ name: id === "none" ? t("task.unassigned") : (profiles[id]?.name ?? "…"), count })).sort((a, b) => b.count - a.count);
  }, [assignees, list, today, profiles, t]);

  if (!projectId) return <EmptyState illustration="folder" title={t("project.noProjects")} />;

  return (
    <div className="space-y-4">
      <Select value={projectId} onValueChange={setPid}>
        <SelectTrigger className="w-72 bg-card" aria-label={t("reports.selectProject")}>
          <SelectValue placeholder={t("reports.selectProject")} />
        </SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <ProjectDot color={p.color} /> {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("reports.progressOverTime")}
          csvName="progress"
          table={{ columns: [{ key: "week", label: t("reports.week") }, { key: "percent", label: "%", numeric: true }, { key: "done", label: t("reports.completed"), numeric: true }, { key: "total", label: t("common.all"), numeric: true }], rows: progress.map((w) => ({ ...w })) }}
        >
          <ResponsiveContainer>
            <AreaChart data={progress} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="week" tickFormatter={weekLabel} {...axisProps} minTickGap={12} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axisProps} />
              <Tooltip cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} content={<ChartTooltip labelFormat={weekLabel} format={(v) => `${v}%`} />} />
              <Area dataKey="percent" name={t("project.progress")} stroke={SLOT[0]} fill={SLOT[0]} fillOpacity={0.1} {...lineProps} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={t("reports.createdVsCompleted")}
          csvName="created-vs-completed"
          legend={[
            { label: t("reports.created"), color: SLOT[1], kind: "bar" },
            { label: t("reports.completed"), color: SLOT[0], kind: "bar" },
          ]}
          table={{ columns: [{ key: "week", label: t("reports.week") }, { key: "created", label: t("reports.created"), numeric: true }, { key: "completed", label: t("reports.completed"), numeric: true }], rows: cvc.map((w) => ({ ...w })) }}
        >
          <ResponsiveContainer>
            <BarChart data={cvc} margin={{ top: 8, right: 4, left: -20, bottom: 0 }} barGap={2}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="week" tickFormatter={weekLabel} {...axisProps} minTickGap={12} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip labelFormat={weekLabel} />} />
              <Bar dataKey="created" name={t("reports.created")} fill={SLOT[1]} {...barProps} maxBarSize={14} />
              <Bar dataKey="completed" name={t("reports.completed")} fill={SLOT[0]} {...barProps} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={t("reports.overdueByAssignee")}
          csvName="overdue-by-assignee"
          height={Math.max(140, byAssignee.length * 34)}
          className="lg:col-span-2"
          table={{ columns: [{ key: "name", label: t("table.assignee") }, { key: "count", label: t("reports.overdue"), numeric: true }], rows: byAssignee }}
        >
          {byAssignee.length === 0 ? (
            <p className="py-10 text-center text-13 text-muted-foreground">{t("home.atRiskNone")}</p>
          ) : (
            <ResponsiveContainer>
              <BarChart data={byAssignee} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" allowDecimals={false} {...axisProps} />
                <YAxis type="category" dataKey="name" width={130} {...axisProps} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip />} />
                <Bar dataKey="count" name={t("reports.overdue")} fill={SLOT[0]} {...hbarProps} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
