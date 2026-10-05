"use client";

import { CalendarClock, LineChart as LineIcon, MoreHorizontal, Plus, Target, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, ChartTooltip, gridProps, lineProps, SLOT } from "@/components/charts/kit";
import { PageHeader, ProgressBar, ProjectBadge } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { ColorPicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeColor } from "@/lib/colors";
import { useFormat } from "@/lib/format";
import type { Goal, KeyResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { addKeyResult, createGoal, deleteGoal, deleteKeyResult, updateGoal, updateKeyResult } from "@/store/actions";
import { useCurrentWorkspace, useProjects, useToday, useTz, useWorkspaceRole } from "@/store/hooks";
import { useStore } from "@/store/store";
import { isFullMember } from "@/lib/permissions";

function krProgress(k: Pick<KeyResult, "start_value" | "target" | "current">): number {
  if (k.target === k.start_value) return k.current >= k.target ? 100 : 0;
  return Math.max(0, Math.min(100, ((k.current - k.start_value) / (k.target - k.start_value)) * 100));
}

export default function GoalsPage() {
  const t = useTranslations();
  const ws = useCurrentWorkspace();
  const role = useWorkspaceRole(ws?.id);
  const goals = useStore((s) => s.data.goals);
  const krs = useStore((s) => s.data.key_results);
  const [open, setOpen] = useState(false);
  const list = useMemo(
    () =>
      Object.values(goals)
        .filter((g) => g.workspace_id === ws?.id && !g.deleted_at)
        .sort((a, b) => Number(a.status !== "active") - Number(b.status !== "active") || (a.target_date ?? "9").localeCompare(b.target_date ?? "9")),
    [goals, ws?.id],
  );
  const writable = isFullMember(role);

  return (
    <PageContainer>
      <PageHeader
        title={t("goals.title")}
        subtitle={t("goals.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand-fg"><Target className="size-5" /></span>}
        actions={writable && <Button size="sm" onClick={() => setOpen(true)}><Plus /> {t("goals.new")}</Button>}
      />
      {list.length === 0 ? (
        <EmptyState illustration="target" title={t("goals.empty")} body={t("goals.emptyBody")} action={writable && <Button onClick={() => setOpen(true)}><Plus /> {t("goals.new")}</Button>} />
      ) : (
        <div className="space-y-4">
          {list.map((g) => (
            <GoalCard key={g.id} goal={g} krs={Object.values(krs).filter((k) => k.goal_id === g.id).sort((a, b) => a.position - b.position)} writable={writable} />
          ))}
        </div>
      )}
      {ws && <NewGoalDialog open={open} onOpenChange={setOpen} workspaceId={ws.id} />}
    </PageContainer>
  );
}

function GoalCard({ goal, krs, writable }: { goal: Goal; krs: KeyResult[]; writable: boolean }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const project = useStore((s) => (goal.project_id ? s.data.projects[goal.project_id] : undefined));
  const history = useStore((s) => s.data.key_result_history);
  const [chartFor, setChartFor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [kr, setKr] = useState({ title: "", start: "0", target: "", unit: "" });
  const pct = krs.length ? krs.reduce((n, k) => n + krProgress(k), 0) / krs.length : 0;

  const chartData = useMemo(() => {
    if (!chartFor) return [];
    return Object.values(history)
      .filter((h) => h.key_result_id === chartFor)
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
      .map((h) => ({ date: h.recorded_at.slice(0, 10), value: Number(h.value) }));
  }, [history, chartFor]);

  return (
    <article data-color={safeColor(goal.color)} className="overflow-hidden rounded-2xl border bg-card shadow-elev-1">
      <div className="flex items-start gap-4 p-5">
        <div className="relative size-14 shrink-0">
          <svg viewBox="0 0 36 36" className="size-14 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--muted)" strokeWidth="4" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--pc)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} className="transition-[stroke-dasharray] duration-700" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tnum">{Math.round(pct)}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 className="flex-1 font-sans text-lg font-semibold tracking-normal">{goal.title}</h2>
            {writable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t("common.more")}><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(["active", "achieved", "missed", "archived"] as const).map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => updateGoal(goal.id, { status: s })}>{t(`goals.status.${s}`)}</DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => deleteGoal(goal.id)}><Trash2 /> {t("common.delete")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("rounded-full px-2 py-0.5 font-medium", goal.status === "achieved" ? "bg-success-soft text-success-fg" : goal.status === "missed" ? "bg-danger-soft text-danger-fg" : "bg-muted")}>
              {t(`goals.status.${goal.status}`)}
            </span>
            {project ? <ProjectBadge name={project.name} color={project.color} /> : <span>{t("goals.workspaceGoal")}</span>}
            {goal.target_date && (
              <span className="inline-flex items-center gap-1 tnum"><CalendarClock className="size-3.5" /> {f.dayMonth(goal.target_date)}</span>
            )}
          </div>
        </div>
      </div>
      <ul className="divide-y border-t">
        {krs.map((k) => (
          <li key={k.id} className="px-5 py-3">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-sm">{k.title}</p>
              <label className="flex items-center gap-1.5 text-13 tnum">
                <span className="sr-only">{t("goals.krCurrent")}</span>
                <Input
                  type="number"
                  defaultValue={k.current}
                  key={k.current}
                  disabled={!writable}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v) && v !== Number(k.current)) updateKeyResult(k, { current: v });
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="h-7 w-20 text-right"
                />
                <span className="text-muted-foreground">/ {k.target} {k.unit}</span>
              </label>
              <Button variant="ghost" size="icon-sm" aria-label={t("goals.history")} aria-pressed={chartFor === k.id} onClick={() => setChartFor(chartFor === k.id ? null : k.id)}>
                <LineIcon />
              </Button>
              {writable && (
                <Button variant="ghost" size="icon-sm" aria-label={t("common.delete")} onClick={() => deleteKeyResult(k.id)}>
                  <X />
                </Button>
              )}
            </div>
            <ProgressBar value={krProgress(k)} color={goal.color} className="mt-2" label={k.title} />
            {chartFor === k.id && (
              <div className="mt-3 h-40 animate-fade-up" role="img" aria-label={`${t("goals.history")}: ${k.title}`}>
                {chartData.length < 2 ? (
                  <p className="py-12 text-center text-13 text-muted-foreground">{t("reports.noData")}</p>
                ) : (
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="date" tickFormatter={(d) => f.dayMonth(String(d))} {...axisProps} minTickGap={16} />
                      <YAxis domain={[Math.min(Number(k.start_value), ...chartData.map((d) => d.value)), Math.max(Number(k.target), ...chartData.map((d) => d.value))]} {...axisProps} />
                      <Tooltip cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} content={<ChartTooltip labelFormat={(d) => f.dayMonth(String(d))} format={(v) => `${v} ${k.unit ?? ""}`} />} />
                      <Line dataKey="value" name={k.title} stroke={SLOT[0]} {...lineProps} dot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: SLOT[0] }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {writable && (
        <div className="border-t px-5 py-3">
          {adding ? (
            <form
              className="grid gap-2 sm:grid-cols-[1fr_5rem_5rem_5rem_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                if (!kr.title.trim() || !kr.target) return;
                addKeyResult(goal, { title: kr.title.trim(), start_value: Number(kr.start) || 0, target: Number(kr.target), unit: kr.unit || null });
                setKr({ title: "", start: "0", target: "", unit: "" });
                setAdding(false);
              }}
            >
              <Input autoFocus placeholder={t("goals.krTitle")} value={kr.title} onChange={(e) => setKr({ ...kr, title: e.target.value })} aria-label={t("goals.krTitle")} />
              <Input type="number" placeholder={t("goals.krStart")} value={kr.start} onChange={(e) => setKr({ ...kr, start: e.target.value })} aria-label={t("goals.krStart")} />
              <Input type="number" placeholder={t("goals.krTarget")} value={kr.target} onChange={(e) => setKr({ ...kr, target: e.target.value })} aria-label={t("goals.krTarget")} />
              <Input placeholder={t("goals.krUnit")} value={kr.unit} onChange={(e) => setKr({ ...kr, unit: e.target.value })} aria-label={t("goals.krUnit")} />
              <Button type="submit" size="sm" className="h-9">{t("common.add")}</Button>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-13 text-muted-foreground hover:text-foreground">
              <Plus className="size-4" /> {t("goals.addKr")}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function NewGoalDialog({ open, onOpenChange, workspaceId }: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: string }) {
  const t = useTranslations();
  const projects = useProjects(workspaceId);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [target, setTarget] = useState("");
  const [color, setColor] = useState("violet");
  const [krs, setKrs] = useState([{ title: "", start: "0", target: "", unit: "" }]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createGoal(
      { workspace_id: workspaceId, title: title.trim(), project_id: projectId === "none" ? null : projectId, target_date: target || null, color },
      krs.filter((k) => k.title.trim() && k.target).map((k) => ({ title: k.title.trim(), start_value: Number(k.start) || 0, current: Number(k.start) || 0, target: Number(k.target), unit: k.unit || null })),
    );
    setTitle("");
    setKrs([{ title: "", start: "0", target: "", unit: "" }]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("goals.new")}</DialogTitle>
            <DialogDescription>{t("goals.emptyBody")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="g-title">{t("common.name")}</Label>
            <Input id="g-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("goals.titlePlaceholder")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("goals.project")}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger aria-label={t("goals.project")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("goals.workspaceGoal")}</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-target">{t("goals.targetDate")}</Label>
              <Input id="g-target" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.color")}</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="space-y-2">
            <Label>{t("goals.keyResults")}</Label>
            {krs.map((k, i) => (
              <div key={i} className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-1.5">
                <Input placeholder={t("goals.krTitle")} value={k.title} onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label={t("goals.krTitle")} />
                <Input type="number" placeholder={t("goals.krStart")} value={k.start} onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} aria-label={t("goals.krStart")} />
                <Input type="number" placeholder={t("goals.krTarget")} value={k.target} onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} aria-label={t("goals.krTarget")} />
                <Input placeholder={t("goals.krUnit")} value={k.unit} onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} aria-label={t("goals.krUnit")} />
              </div>
            ))}
            {krs.length < 6 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setKrs([...krs, { title: "", start: "0", target: "", unit: "" }])}>
                <Plus /> {t("goals.addKr")}
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!title.trim()}>{t("common.create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
