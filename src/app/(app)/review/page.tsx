"use client";

import { ArrowLeft, ArrowRight, Check, ClipboardCheck, History } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { StatTile } from "@/components/charts/kit";
import { PageHeader } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addDays, nextWeekday, startOfWeek } from "@/lib/dates";
import { byDueThenPriority } from "@/lib/filters";
import { useFormat } from "@/lib/format";
import { isOpen } from "@/lib/health";
import { followUpDue, waitingTasks, weekNumbers } from "@/lib/org";
import type { WeeklyReview, WeeklyReviewData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { rescheduleTasks } from "@/store/actions";
import { saveReview } from "@/store/org-actions";
import { useMyTasks, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

const STEPS = ["inbox", "numbers", "overdue", "waiting", "next", "reflect"] as const;

/** Guided weekly review: six short steps, saved as you go, with a history of past weeks. */
export default function ReviewPage() {
  const t = useTranslations();
  const today = useToday();
  const uid = useUserId();
  const weekStart = startOfWeek(today);
  const reviews = useStore((s) => s.data.weekly_reviews);
  const mine = useMemo(() => Object.values(reviews).filter((r) => r.user_id === uid).sort((a, b) => b.week_start.localeCompare(a.week_start)), [reviews, uid]);
  const current = mine.find((r) => r.week_start === weekStart);
  const [restart, setRestart] = useState(false);

  return (
    <PageContainer>
      <PageHeader
        title={t("review.title")}
        subtitle={t("review.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand-fg"><ClipboardCheck className="size-5" /></span>}
      />
      {current?.completed_at && !restart ? (
        <div className="mb-6 rounded-2xl border bg-success-soft/40 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-success-fg"><Check className="size-4" /> {t("review.doneThisWeek")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setRestart(true)}>{t("review.again")}</Button>
        </div>
      ) : (
        <Wizard key={weekStart} weekStart={weekStart} review={current} onDone={() => setRestart(false)} />
      )}
      <ReviewHistory reviews={mine.filter((r) => r.completed_at)} />
    </PageContainer>
  );
}

function Wizard({ weekStart, review, onDone }: { weekStart: string; review: WeeklyReview | undefined; onDone: () => void }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const uid = useUserId();
  const f = useFormat(today, tz);
  const [step, setStep] = useState(Math.min(review?.completed_at ? 0 : (review?.data.step ?? 0), STEPS.length - 1));
  const [text, setText] = useState<Pick<WeeklyReviewData, "wins" | "lessons" | "focus">>({
    wins: review?.data.wins ?? "",
    lessons: review?.data.lessons ?? "",
    focus: review?.data.focus ?? "",
  });
  const my = useMyTasks();
  const allTasks = useStore((s) => s.data.tasks);
  const entries = useStore((s) => s.data.time_entries);
  const inbox = useMemo(() => my.filter((x) => !x.project_id && isOpen(x)).sort(byDueThenPriority), [my]);
  const overdue = useMemo(() => my.filter((x) => isOpen(x) && x.due_date && x.due_date < today).sort(byDueThenPriority), [my, today]);
  const waiting = useMemo(() => waitingTasks(my), [my]);
  const nextMonday = nextWeekday(today, 1, false);
  const nextWeek = useMemo(
    () => my.filter((x) => isOpen(x) && ((x.due_date && x.due_date >= nextMonday && x.due_date <= addDays(nextMonday, 6)) || (x.deadline && x.deadline >= nextMonday && x.deadline <= addDays(nextMonday, 6)))).sort(byDueThenPriority),
    [my, nextMonday],
  );
  const stats = useMemo(
    () => weekNumbers(Object.values(allTasks).filter((x) => my.some((m) => m.id === x.id)), Object.values(entries), weekStart, today, tz, uid),
    [allTasks, my, entries, weekStart, today, tz, uid],
  );

  const go = (to: number) => {
    saveReview(weekStart, { ...text, step: to, stats });
    setStep(to);
  };
  const finish = () => {
    saveReview(weekStart, { ...text, step: STEPS.length - 1, stats }, true);
    onDone();
  };
  const key = STEPS[step];

  return (
    <section aria-labelledby="review-step" className="mb-8 rounded-2xl border bg-card p-4 shadow-elev-1 md:p-5">
      <ol className="mb-4 flex gap-1.5" aria-label={t("review.progress", { step: step + 1, total: STEPS.length })}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-brand" : i === step ? "bg-brand/60" : "bg-muted")} />
        ))}
      </ol>
      <p className="text-xs font-medium text-muted-foreground tnum">{t("review.stepOf", { step: step + 1, total: STEPS.length })}</p>
      <h2 id="review-step" className="mt-0.5 font-sans text-lg font-semibold tracking-normal">{t(`review.steps.${key}.title`)}</h2>
      <p className="mb-4 text-13 text-muted-foreground">{t(`review.steps.${key}.body`)}</p>

      {key === "inbox" &&
        (inbox.length ? <TaskList groups={[{ key: "inbox", tasks: inbox, noAdd: true }]} /> : <Clear text={t("review.inboxClear")} />)}
      {key === "numbers" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label={t("review.done")} value={f.num(stats.done)} />
          <StatTile label={t("review.overdueNow")} value={f.num(stats.overdue)} />
          <StatTile label={t("review.tracked")} value={f.duration(stats.minutes)} />
        </div>
      )}
      {key === "overdue" &&
        (overdue.length ? (
          <>
            <TaskList groups={[{ key: "overdue", tasks: overdue, noAdd: true, tone: "danger" }]} showProject />
            <Button variant="outline" size="sm" className="mt-3" onClick={() => rescheduleTasks(overdue.map((x) => x.id), nextMonday)}>
              {t("review.moveAllToMonday", { count: overdue.length })}
            </Button>
          </>
        ) : (
          <Clear text={t("review.noOverdue")} />
        ))}
      {key === "waiting" &&
        (waiting.length ? (
          <>
            {waiting.some((w) => followUpDue(w, today)) && <p className="mb-2 text-13 font-medium text-warning-fg">{t("review.chaseHint")}</p>}
            <TaskList groups={[{ key: "waiting", tasks: waiting, noAdd: true }]} showProject />
          </>
        ) : (
          <Clear text={t("review.noWaiting")} />
        ))}
      {key === "next" && (
        <div className="space-y-3">
          {nextWeek.length ? <TaskList groups={[{ key: "next", tasks: nextWeek, noAdd: true }]} showProject /> : <Clear text={t("review.nextWeekEmpty")} />}
          <div className="space-y-1.5">
            <Label htmlFor="r-focus">{t("review.focus")}</Label>
            <Textarea id="r-focus" rows={2} maxLength={1000} value={text.focus} onChange={(e) => setText({ ...text, focus: e.target.value })} placeholder={t("review.focusPlaceholder")} />
          </div>
        </div>
      )}
      {key === "reflect" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="r-wins">{t("review.wins")}</Label>
            <Textarea id="r-wins" rows={3} maxLength={2000} value={text.wins} onChange={(e) => setText({ ...text, wins: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-lessons">{t("review.lessons")}</Label>
            <Textarea id="r-lessons" rows={3} maxLength={2000} value={text.lessons} onChange={(e) => setText({ ...text, lessons: e.target.value })} />
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}><ArrowLeft /> {t("common.back")}</Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => go(step + 1)}>{t("common.next")} <ArrowRight /></Button>
        ) : (
          <Button onClick={finish}><Check /> {t("review.finish")}</Button>
        )}
      </div>
    </section>
  );
}

function Clear({ text }: { text: string }) {
  return <p className="flex items-center gap-2 rounded-xl bg-success-soft/50 px-3 py-3 text-sm text-success-fg"><Check className="size-4" /> {text}</p>;
}

function ReviewHistory({ reviews }: { reviews: WeeklyReview[] }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  return (
    <section aria-labelledby="r-history" className="space-y-2">
      <h2 id="r-history" className="flex items-center gap-2 px-1 font-sans text-13 font-semibold tracking-normal text-muted-foreground"><History className="size-4" /> {t("review.history")}</h2>
      {reviews.length === 0 ? (
        <EmptyState compact illustration="chart" title={t("review.historyEmpty")} body={t("review.historyEmptyBody")} />
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <details className="group rounded-2xl border bg-card p-3.5 shadow-elev-1">
                <summary className="flex cursor-pointer list-none items-center gap-3 text-sm">
                  <span className="font-semibold">{t("review.weekOf", { date: f.dayMonth(r.week_start) })}</span>
                  {r.data.stats && (
                    <span className="text-xs text-muted-foreground tnum">
                      {t("review.historyStats", { done: r.data.stats.done, overdue: r.data.stats.overdue })} · {f.duration(r.data.stats.minutes)}
                    </span>
                  )}
                </summary>
                <dl className="mt-3 space-y-2 text-13">
                  {(["wins", "lessons", "focus"] as const).map((k) =>
                    r.data[k] ? (
                      <div key={k}>
                        <dt className="font-medium text-muted-foreground">{t(`review.${k}`)}</dt>
                        <dd className="whitespace-pre-line">{r.data[k]}</dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 pt-2 text-xs text-muted-foreground">
        <Link href="/settings" className="underline-offset-2 hover:underline">{t("review.reminderHint")}</Link>
      </p>
    </section>
  );
}
