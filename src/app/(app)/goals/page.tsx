"use client";

import { CalendarClock, LineChart as LineIcon, MoreHorizontal, Plus, Target, Trash2, X, Zap } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { safeColor } from "@/lib/colors";
import { goalPace, goalProgress, krProgress, withLive, type AutoData } from "@/lib/goals";
import { useFormat } from "@/lib/format";
import type { Goal, KeyResult, KeyResultSource } from "@/lib/types";
import { cn } from "@/lib/utils";
import { addKeyResult, createGoal, deleteGoal, deleteKeyResult, updateGoal, updateKeyResult } from "@/store/actions";
import { useCurrentWorkspace, useLabels, useProjects, useToday, useTz, useWorkspaceRole } from "@/store/hooks";
import { useStore } from "@/store/store";
import { isFullMember } from "@/lib/permissions";

/** Everything a data-fed key result can count: money, won deals, labelled tasks. */
function useAutoData(): AutoData {
  const money = useStore((s) => s.data.money_entries);
  const deals = useStore((s) => s.data.deals);
  const stages = useStore((s) => s.data.deal_stages);
  const tasks = useStore((s) => s.data.tasks);
  const taskLabels = useStore((s) => s.data.task_labels);
  return useMemo(
    () => ({ money: Object.values(money), deals: Object.values(deals), stages, tasks: Object.values(tasks), taskLabels: Object.values(taskLabels) }),
    [money, deals, stages, tasks, taskLabels],
  );
}

export default function GoalsPage() {
  const t = useTranslations();
  const ws = useCurrentWorkspace();
  const role = useWorkspaceRole(ws?.id);
  const goals = useStore((s) => s.data.goals);
  const krs = useStore((s) => s.data.key_results);
  const auto = useAutoData();
  const today = useToday();
  const tz = useTz();
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
            <GoalCard
              key={g.id}
              goal={g}
              krs={Object.values(krs).filter((k) => k.goal_id === g.id).sort((a, b) => a.position - b.position).map((k) => withLive(k, g, auto, today, tz))}
              writable={writable}
            />
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
  const [confirmDelete, setConfirmDelete] = useState<KeyResult | null>(null);
  const pct = goalProgress(krs);
  const pace = goalPace(goal, krs, today);
  const value = (v: number, unit?: string | null) => `${f.num(Number(v), Number.isInteger(Number(v)) ? 0 : 1)}${unit ? ` ${unit}` : ""}`;

  const chartData = useMemo(() => {
    if (!chartFor) return [];
    return Object.values(history)
      .filter((h) => h.key_result_id === chartFor)
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
      .map((h) => ({ date: h.recorded_at.slice(0, 10), value: Number(h.value), note: h.note }));
  }, [history, chartFor]);

  return (
    <article data-color={safeColor(goal.color)} className="overflow-hidden rounded-2xl border bg-card shadow-elev-1">
      <div className="flex items-start gap-4 p-5">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="relative size-14 shrink-0 rounded-full" aria-label={t("goals.howCalculated", { percent: Math.round(pct) })}>
          <svg viewBox="0 0 36 36" className="size-14 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--muted)" strokeWidth="4" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--pc)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} className="transition-[stroke-dasharray] duration-700" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tnum">{Math.round(pct)}%</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-2 text-13">
            <p className="font-semibold">{t("goals.calcTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("goals.calcBody")}</p>
            <ul className="space-y-1">
              {krs.map((k) => (
                <li key={k.id} className="flex items-baseline justify-between gap-2 tnum">
                  <span className="min-w-0 truncate">{k.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    ({value(k.current)} − {value(k.start_value)}) ÷ ({value(k.target)} − {value(k.start_value)}) = <b className="text-foreground">{f.num(krProgress(k))}%</b>
                  </span>
                </li>
              ))}
            </ul>
            {krs.length > 1 && (
              <p className="border-t pt-2 text-xs tnum">
                {t("goals.calcAverage")}: ({krs.map((k) => `${f.num(krProgress(k))}%`).join(" + ")}) ÷ {krs.length} = <b>{f.num(pct)}%</b>
              </p>
            )}
          </PopoverContent>
        </Popover>
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
              <span className="inline-flex items-center gap-1 tnum">
                <CalendarClock className="size-3.5" aria-hidden /> {goal.start_date ? `${f.dayMonth(goal.start_date)} – ` : ""}
                {f.dayMonth(goal.target_date)}
              </span>
            )}
          </div>
          {pace && goal.status === "active" && (
            <div className="mt-3 space-y-1">
              <div className="relative h-2 rounded-full bg-muted" role="img" aria-label={t(`goals.pace.${pace.pace}`, { elapsed: f.num(pace.elapsed), progress: f.num(pace.progress) })}>
                <div className="h-full rounded-full bg-pc" style={{ width: `${pace.progress}%` }} />
                <span className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground" style={{ left: `calc(${pace.elapsed}% - 1px)` }} title={t("goals.timePassed", { percent: f.num(pace.elapsed) })} />
              </div>
              <p className={cn("text-xs", pace.pace === "behind" ? "text-danger-fg" : pace.pace === "ahead" ? "text-success-fg" : "text-muted-foreground")}>
                {t(`goals.pace.${pace.pace}`, { elapsed: f.num(pace.elapsed), progress: f.num(pace.progress) })}
              </p>
            </div>
          )}
        </div>
      </div>
      <ul className="divide-y border-t">
        {krs.map((k) => (
          <li key={k.id} className="px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words">{k.title}</p>
                <p className="text-xs text-muted-foreground tnum">
                  {Number(k.start_value) !== 0 && <>{t("goals.krFrom", { value: value(k.start_value) })} → </>}
                  {value(k.current)} / {value(k.target, k.unit)} · <b className="text-foreground">{f.num(krProgress(k))}%</b>
                </p>
              </div>
              {k.source !== "manual" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-2xs font-medium text-info-fg" title={t("goals.autoHint")}>
                  <Zap className="size-3" /> {t(`goals.sources.${k.source}`)}
                </span>
              ) : (
                <CheckIn kr={k} disabled={!writable} unitLabel={value(k.target, k.unit)} />
              )}
              {writable && <KrSource kr={k} workspaceId={goal.workspace_id} />}
              <Button variant="ghost" size="icon-sm" aria-label={t("goals.history")} aria-pressed={chartFor === k.id} onClick={() => setChartFor(chartFor === k.id ? null : k.id)}>
                <LineIcon />
              </Button>
              {writable && (
                <Button variant="ghost" size="icon-sm" aria-label={t("goals.deleteKr", { title: k.title })} onClick={() => setConfirmDelete(k)}>
                  <X />
                </Button>
              )}
            </div>
            <ProgressBar value={krProgress(k)} color={goal.color} className="mt-2" label={k.title} />
            {chartFor === k.id && (
              <div className="mt-3 h-40 animate-fade-up" role="img" aria-label={`${t("goals.history")}: ${k.title}`}>
                {chartData.length < 2 ? (
                  <p className="py-12 text-center text-13 text-muted-foreground">{k.source !== "manual" ? t("goals.autoHint") : t("reports.noData")}</p>
                ) : (
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="date" tickFormatter={(d) => f.dayMonth(String(d))} {...axisProps} minTickGap={16} />
                      <YAxis domain={[Math.min(Number(k.start_value), ...chartData.map((d) => d.value)), Math.max(Number(k.target), ...chartData.map((d) => d.value))]} tickFormatter={(v: number) => f.num(v)} {...axisProps} />
                      <Tooltip cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} content={<ChartTooltip labelFormat={(d) => f.dayMonth(String(d))} format={(v) => value(v, k.unit)} />} />
                      <Line dataKey="value" name={k.title} stroke={SLOT[0]} {...lineProps} dot={{ r: 3, strokeWidth: 2, stroke: "var(--card)", fill: SLOT[0] }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
            {chartFor === k.id && chartData.some((d) => d.note) && (
              <ul className="mt-2 space-y-0.5 text-xs" aria-label={t("goals.checkInNotes")}>
                {chartData.filter((d) => d.note).map((d, i) => (
                  <li key={i} className="flex gap-2 tnum">
                    <span className="shrink-0 text-muted-foreground">{f.dayMonth(d.date)} · {value(d.value, k.unit)}</span>
                    <span>{d.note}</span>
                  </li>
                ))}
              </ul>
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
      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("goals.deleteKrTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("goals.deleteKrBody", { title: confirmDelete?.title ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDelete) deleteKeyResult(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

/** A manual check-in: the new value and an optional note, kept in the history. */
function CheckIn({ kr, disabled, unitLabel }: { kr: KeyResult; disabled: boolean; unitLabel: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(String(kr.current));
  const [note, setNote] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setVal(String(kr.current));
          setNote("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 tnum" disabled={disabled} aria-label={t("goals.checkInFor", { title: kr.title })}>
          {t("goals.checkIn")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(val.replace(",", "."));
            if (Number.isNaN(v)) return;
            updateKeyResult(kr, { current: v }, note);
            setOpen(false);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`ci-${kr.id}`}>{t("goals.krCurrent")}</Label>
            <div className="flex items-center gap-2">
              <Input id={`ci-${kr.id}`} autoFocus inputMode="decimal" className="tnum" value={val} onChange={(e) => setVal(e.target.value)} />
              <span className="shrink-0 text-xs text-muted-foreground">/ {unitLabel}</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cin-${kr.id}`}>{t("goals.checkInNote")}</Label>
            <Input id={`cin-${kr.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t("goals.checkInNotePlaceholder")} />
          </div>
          <Button type="submit" size="sm" className="w-full">{t("common.save")}</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

const SCALES = [1, 1000, 1_000_000] as const;

/** Where a key result's value comes from: manual check-ins, or live data from the modules. */
function KrSource({ kr, workspaceId }: { kr: KeyResult; workspaceId: string }) {
  const t = useTranslations();
  const ws = useStore((s) => s.data.workspaces[workspaceId]);
  const labels = useLabels(workspaceId);
  const projects = useProjects(workspaceId);
  const sources: KeyResultSource[] = ["manual", ...(ws?.modules?.money ? (["money_income"] as const) : []), ...(ws?.modules?.pipeline ? (["pipeline_won"] as const) : []), "tasks_done"];
  const cfg = kr.source_config ?? {};
  const set = (source: KeyResultSource, config: KeyResult["source_config"] = cfg) => updateKeyResult(kr, { source, source_config: config });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("goals.sourceFor", { title: kr.title })}>
          <Zap className={cn(kr.source !== "manual" && "text-info-fg")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1">
          <Label htmlFor={`src-${kr.id}`}>{t("goals.source")}</Label>
          <Select value={kr.source} onValueChange={(v) => set(v as KeyResultSource, {})}>
            <SelectTrigger id={`src-${kr.id}`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {sources.map((s) => <SelectItem key={s} value={s}>{t(`goals.sources.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t(`goals.sourceHints.${kr.source}`)}</p>
        </div>
        {kr.source === "tasks_done" && (
          <div className="space-y-1">
            <Label htmlFor={`lbl-${kr.id}`}>{t("task.labels")}</Label>
            <Select value={cfg.label_id ?? ""} onValueChange={(v) => set("tasks_done", { label_id: v })}>
              <SelectTrigger id={`lbl-${kr.id}`} className="w-full"><SelectValue placeholder={t("goals.pickLabel")} /></SelectTrigger>
              <SelectContent>
                {labels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {kr.source === "money_income" && (
          <>
            <div className="space-y-1">
              <Label htmlFor={`scale-${kr.id}`}>{t("goals.scale")}</Label>
              <Select value={String(cfg.scale ?? 1)} onValueChange={(v) => set("money_income", { ...cfg, scale: Number(v) })}>
                <SelectTrigger id={`scale-${kr.id}`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCALES.map((sc) => <SelectItem key={sc} value={String(sc)}>{t(`goals.scales.${sc}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`proj-${kr.id}`}>{t("task.project")}</Label>
              <Select value={cfg.project_id ?? "all"} onValueChange={(v) => set("money_income", { ...cfg, project_id: v === "all" ? undefined : v })}>
                <SelectTrigger id={`proj-${kr.id}`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("money.allProjects")}</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
