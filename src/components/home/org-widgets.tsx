"use client";

import { ChevronRight, ListChecks, MoonStar, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Section } from "@/components/common/bits";
import { minutesToHHMM } from "@/lib/dates";
import { routineDueOn, runProgress, shutdownDue } from "@/lib/org";
import { cn } from "@/lib/utils";
import { useMe, useNowMinutes, useRoutines, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

/** After the chosen time, a nudge to close the day (Settings → «Kunni yakunlash»). */
export function ShutdownCard() {
  const t = useTranslations("shutdown");
  const me = useMe();
  const uid = useUserId();
  const today = useToday();
  const now = useNowMinutes();
  const shutdowns = useStore((s) => s.data.daily_shutdowns);
  const done = useMemo(() => Object.values(shutdowns).some((r) => r.user_id === uid && r.date === today && r.completed_at), [shutdowns, uid, today]);
  if (!me || !shutdownDue(me, minutesToHHMM(now), done)) return null;
  return (
    <Link href="/shutdown" className="flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft/60 p-3.5 transition-colors hover:bg-brand-soft">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-brand"><MoonStar className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t("homeTitle")}</span>
        <span className="block text-13 text-muted-foreground">{t("homeBody")}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}

/** Today's routines with their progress; a tap opens the routines page. */
export function RoutinesRow() {
  const t = useTranslations("routines");
  const routines = useRoutines();
  const runs = useStore((s) => s.data.routine_runs);
  const today = useToday();
  const tz = useTz();
  const list = useMemo(() => routines.filter((r) => routineDueOn(r, today, tz)), [routines, today, tz]);
  if (routines.length === 0) {
    return (
      <Link href="/routines" className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-13 text-muted-foreground hover:border-brand hover:text-brand-fg">
        <Plus className="size-4" /> {t("homeEmpty")}
      </Link>
    );
  }
  if (list.length === 0) return null;
  return (
    <Section title={t("title")}>
      <ul className="space-y-1.5">
        {list.map((r) => {
          const run = Object.values(runs).find((x) => x.routine_id === r.id && x.date === today);
          const { done, total } = runProgress(r, run);
          const complete = total > 0 && done === total;
          return (
            <li key={r.id}>
              <Link href="/routines" data-color={r.color} className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-13 hover:bg-muted/50">
                <ListChecks className={cn("size-4 shrink-0", complete ? "text-success-fg" : "text-pc")} />
                <span className={cn("min-w-0 flex-1 truncate font-medium", complete && "text-muted-foreground line-through")}>{r.name}</span>
                <span className="text-xs text-muted-foreground tnum">{t("progress", { done, total })}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
