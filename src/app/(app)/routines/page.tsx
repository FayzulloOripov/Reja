"use client";

import { Archive, Check, ListChecks, Lock, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageHeader, UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { ColorPicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ROUTINE_RULES, routineDueOn, runProgress } from "@/lib/org";
import type { Routine } from "@/lib/types";
import { cn } from "@/lib/utils";
import { archiveRoutine, createRoutine, toggleRoutineItem } from "@/store/org-actions";
import { useCurrentWorkspace, useRoutines, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

/** Reusable checklists that come back on a schedule (morning routine, monthly payroll close). */
export default function RoutinesPage() {
  const t = useTranslations();
  const routines = useRoutines();
  const today = useToday();
  const tz = useTz();
  const [adding, setAdding] = useState(false);
  const { due, other } = useMemo(() => {
    const isDue = (r: Routine) => routineDueOn(r, today, tz);
    return { due: routines.filter(isDue), other: routines.filter((r) => !isDue(r)) };
  }, [routines, today, tz]);

  return (
    <PageContainer>
      <PageHeader
        title={t("routines.title")}
        subtitle={t("routines.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-success-soft text-success-fg"><ListChecks className="size-5" /></span>}
        actions={<Button size="sm" onClick={() => setAdding(true)}><Plus /> {t("routines.new")}</Button>}
      />
      {adding && <NewRoutine onDone={() => setAdding(false)} />}
      {routines.length === 0 && !adding ? (
        <EmptyState illustration="done" title={t("routines.empty")} body={t("routines.emptyBody")} action={<Button onClick={() => setAdding(true)}><Plus /> {t("routines.new")}</Button>} />
      ) : (
        <>
          {due.length > 0 && (
            <section aria-labelledby="r-today" className="mb-6 space-y-2">
              <h2 id="r-today" className="px-1 font-sans text-13 font-semibold tracking-normal text-muted-foreground">{t("routines.today")}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{due.map((r) => <RoutineCard key={r.id} routine={r} date={today} />)}</div>
            </section>
          )}
          {other.length > 0 && (
            <section aria-labelledby="r-other" className="space-y-2">
              <h2 id="r-other" className="px-1 font-sans text-13 font-semibold tracking-normal text-muted-foreground">{t("routines.notToday")}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{other.map((r) => <RoutineCard key={r.id} routine={r} date={today} idle />)}</div>
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}

function ruleKey(rule: string): keyof typeof ROUTINE_RULES | "custom" {
  return (Object.entries(ROUTINE_RULES).find(([, v]) => v === rule)?.[0] as keyof typeof ROUTINE_RULES) ?? "custom";
}

export function RoutineCard({ routine, date, idle, compact }: { routine: Routine; date: string; idle?: boolean; compact?: boolean }) {
  const t = useTranslations();
  const uid = useUserId();
  const runs = useStore((s) => s.data.routine_runs);
  const profiles = useStore((s) => s.data.profiles);
  const run = useMemo(() => Object.values(runs).find((r) => r.routine_id === routine.id && r.date === date), [runs, routine.id, date]);
  const { done, total } = runProgress(routine, run);
  // a shared routine's day belongs to whoever started it; others can see it but not tick it
  const othersRun = run && run.user_id !== uid;
  const owner = routine.owner_id === uid;
  return (
    <article data-color={routine.color} className={cn("rounded-2xl border bg-card p-4 shadow-elev-1", idle && "opacity-75")} aria-label={routine.name}>
      <header className="flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-pc" aria-hidden />
        <h3 className="min-w-0 flex-1 truncate font-sans text-sm font-semibold tracking-normal">{routine.name}</h3>
        {routine.visibility === "workspace" ? <Users role="img" aria-label={t("routines.shared")} className="size-3.5 text-muted-foreground" /> : <Lock role="img" aria-label={t("routines.private")} className="size-3.5 text-muted-foreground" />}
        <span className={cn("text-xs font-medium tnum", done === total && total > 0 ? "text-success-fg" : "text-muted-foreground")}>{t("common.of", { done, total })}</span>
      </header>
      {!compact && <p className="mt-0.5 text-xs text-muted-foreground">{t(`routines.rules.${ruleKey(routine.recurrence)}`)}</p>}
      {othersRun && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><UserAvatar profile={profiles[run.user_id]} size={16} /> {t("routines.byOther", { name: profiles[run.user_id]?.name ?? "…" })}</p>
      )}
      {!idle && (
        <ul className="mt-2 space-y-0.5">
          {routine.items.map((item) => {
            const checked = run?.checked.includes(item.id) ?? false;
            return (
              <li key={item.id}>
                <label className={cn("flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-muted/60", othersRun && "cursor-default")}>
                  <Checkbox checked={checked} disabled={Boolean(othersRun)} onCheckedChange={() => toggleRoutineItem(routine, date, item.id)} />
                  <span className={cn("text-sm", checked && "text-muted-foreground line-through")}>{item.text}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {done === total && total > 0 && !idle && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-success-fg"><Check className="size-3.5" /> {t("routines.complete")}</p>}
      {owner && !compact && (
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => archiveRoutine(routine)}>
            <Archive /> {t("routines.archive")}
          </Button>
        </div>
      )}
    </article>
  );
}

function NewRoutine({ onDone }: { onDone: () => void }) {
  const t = useTranslations();
  const ws = useCurrentWorkspace();
  const [name, setName] = useState("");
  const [items, setItems] = useState("");
  const [rule, setRule] = useState<keyof typeof ROUTINE_RULES>("daily");
  const [shared, setShared] = useState(false);
  const [color, setColor] = useState("teal");
  const lines = items.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ws || !name.trim() || lines.length === 0) return;
        createRoutine({ workspaceId: ws.id, name, items: lines, recurrence: ROUTINE_RULES[rule], visibility: shared && !ws.is_personal ? "workspace" : "private", color });
        onDone();
      }}
      className="mb-5 space-y-3 rounded-2xl border bg-card p-4 shadow-elev-1"
    >
      <div className="space-y-1.5">
        <Label htmlFor="rt-name">{t("common.name")}</Label>
        <Input id="rt-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={t("routines.namePlaceholder")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rt-items">{t("routines.items")}</Label>
        <Textarea id="rt-items" rows={4} value={items} onChange={(e) => setItems(e.target.value)} placeholder={t("routines.itemsPlaceholder")} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rt-rule">{t("routines.repeat")}</Label>
          <Select value={rule} onValueChange={(v) => setRule(v as keyof typeof ROUTINE_RULES)}>
            <SelectTrigger id="rt-rule" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(ROUTINE_RULES).map((k) => (
                <SelectItem key={k} value={k}>{t(`routines.rules.${k}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {ws && !ws.is_personal && (
          <label className="flex h-9 items-center gap-2 text-sm">
            <Checkbox checked={shared} onCheckedChange={(v) => setShared(v === true)} /> {t("routines.shareWithTeam")}
          </label>
        )}
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={!name.trim() || lines.length === 0}>{t("common.create")}</Button>
      </div>
    </form>
  );
}
