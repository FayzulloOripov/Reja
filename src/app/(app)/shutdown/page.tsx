"use client";

import { ArrowRight, Check, MoonStar, Star } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/bits";
import { PageContainer } from "@/components/shell/app-client";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addDays, dateIn } from "@/lib/dates";
import { byDueThenPriority } from "@/lib/filters";
import { isOpen } from "@/lib/health";
import { unfinishedToday } from "@/lib/org";
import { cn } from "@/lib/utils";
import { setTop } from "@/store/actions";
import { moveLeftoversToTomorrow, saveShutdown } from "@/store/org-actions";
import { useMyTasks, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

/** End-of-day ritual: what got done, move what didn't, choose tomorrow's three, close the day. */
export default function ShutdownPage() {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const uid = useUserId();
  const tomorrow = addDays(today, 1);
  const my = useMyTasks();
  const shutdowns = useStore((s) => s.data.daily_shutdowns);
  const record = useMemo(() => Object.values(shutdowns).find((r) => r.user_id === uid && r.date === today), [shutdowns, uid, today]);
  const [note, setNote] = useState(record?.data.note ?? "");
  const [moved, setMoved] = useState(record?.data.moved ?? 0);

  const doneToday = useMemo(() => my.filter((x) => x.status === "done" && x.completed_at && dateIn(tz, x.completed_at) === today), [my, tz, today]);
  const unfinished = useMemo(() => unfinishedToday(my, today).filter((x) => x.top_date !== tomorrow).sort(byDueThenPriority), [my, today, tomorrow]);
  const candidates = useMemo(
    () => my.filter((x) => isOpen(x) && (x.due_date === tomorrow || x.top_date === tomorrow || (x.due_date && x.due_date < tomorrow))).sort(byDueThenPriority),
    [my, tomorrow],
  );
  const topCount = candidates.filter((x) => x.top_date === tomorrow).length;

  if (record?.completed_at) {
    return (
      <PageContainer>
        <PageHeader title={t("shutdown.title")} icon={<Icon />} />
        <div className="rounded-2xl border bg-card p-6 text-center shadow-elev-1">
          <MoonStar className="mx-auto mb-3 size-10 text-brand" />
          <p className="text-lg font-semibold">{t("shutdown.closed")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("shutdown.closedBody", { done: record.data.done ?? doneToday.length })}</p>
          <Button asChild variant="outline" className="mt-4"><Link href="/">{t("nav.home")}</Link></Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title={t("shutdown.title")} subtitle={t("shutdown.subtitle")} icon={<Icon />} />
      <div className="space-y-5">
        <Step n={1} title={t("shutdown.doneTitle", { count: doneToday.length })}>
          {doneToday.length ? <TaskList groups={[{ key: "done", tasks: doneToday, noAdd: true }]} showProject /> : <p className="text-13 text-muted-foreground">{t("shutdown.doneEmpty")}</p>}
        </Step>
        <Step n={2} title={t("shutdown.unfinishedTitle", { count: unfinished.length })}>
          {unfinished.length ? (
            <>
              <TaskList groups={[{ key: "left", tasks: unfinished, noAdd: true }]} showProject />
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  moveLeftoversToTomorrow(unfinished);
                  setMoved(moved + unfinished.length);
                }}
              >
                <ArrowRight /> {t("shutdown.moveAll", { count: unfinished.length })}
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-2 text-13 text-success-fg"><Check className="size-4" /> {t("shutdown.nothingLeft")}</p>
          )}
        </Step>
        <Step n={3} title={t("shutdown.top3Title")} hint={t("shutdown.top3Count", { count: topCount })}>
          {candidates.length ? (
            <ul className="space-y-1">
              {candidates.map((task) => {
                const on = task.top_date === tomorrow;
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={!on && topCount >= 3}
                      onClick={() => setTop(task, !on, tomorrow)}
                      className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-50", on && "bg-warning-soft/60")}
                    >
                      <Star className={cn("size-4 shrink-0", on ? "fill-warning text-warning" : "text-muted-foreground")} />
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-13 text-muted-foreground">{t("shutdown.top3Empty")}</p>
          )}
        </Step>
        <Step n={4} title={t("shutdown.noteTitle")}>
          <Label htmlFor="s-note" className="sr-only">{t("shutdown.noteTitle")}</Label>
          <Textarea id="s-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("shutdown.notePlaceholder")} />
        </Step>
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={() =>
              saveShutdown(today, { done: doneToday.length, moved, note: note.trim() || undefined, tomorrow: candidates.filter((x) => x.top_date === tomorrow).map((x) => x.id) }, true)
            }
          >
            <MoonStar /> {t("shutdown.finish")}
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

function Icon() {
  return <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand-fg"><MoonStar className="size-5" /></span>;
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`s-step-${n}`} className="rounded-2xl border bg-card p-4 shadow-elev-1">
      <h2 id={`s-step-${n}`} className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs tnum">{n}</span>
        {title}
        {hint && <span className="ml-auto text-xs font-medium text-muted-foreground tnum">{hint}</span>}
      </h2>
      {children}
    </section>
  );
}
