"use client";

import { ArrowDownLeft, ArrowUpRight, Banknote, Check, ChevronLeft, ChevronRight, Clock, Scale, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, barProps, ChartCard, ChartTooltip, gridProps, SLOT, StatTile } from "@/components/charts/kit";
import { PageHeader, UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { ModuleOff } from "@/components/business/module-off";
import { MoneyDialog } from "@/components/business/money-dialog";
import { PageContainer } from "@/components/shell/app-client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormat } from "@/lib/format";
import { compactUzs, counted, FUND, inMonth, moneyLabel, monthlySeries, shiftMonth, split, toUzs, totals } from "@/lib/money";
import { isFullMember } from "@/lib/permissions";
import type { MoneyEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { decideEntry, deleteMoneyEntry } from "@/store/business-actions";
import { useCurrentWorkspace, useMembers, useProjects, useToday, useTz, useUserId, useWorkspaceRole } from "@/store/hooks";
import { useStore } from "@/store/store";

const ALL = "all";

/** Income and expenses per month, approvals, and the partner split. */
export default function MoneyPage() {
  const t = useTranslations();
  const ws = useCurrentWorkspace();
  const role = useWorkspaceRole(ws?.id);
  const uid = useUserId();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const entriesById = useStore((s) => s.data.money_entries);
  const profiles = useStore((s) => s.data.profiles);
  const projects = useProjects(ws?.id);
  const members = useMembers(ws?.id);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [project, setProject] = useState(ALL);
  const [partner, setPartner] = useState(ALL);
  const [dialog, setDialog] = useState<MoneyEntry | "income" | "expense" | null>(null);

  const all = useMemo(() => Object.values(entriesById).filter((e) => e.workspace_id === ws?.id && !e.deleted_at), [entriesById, ws?.id]);
  const filtered = useMemo(
    () => all.filter((e) => (project === ALL || e.project_id === project) && (partner === ALL || e.partner_id === partner)),
    [all, project, partner],
  );
  const monthEntries = useMemo(() => inMonth(filtered, month).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)), [filtered, month]);
  const sum = totals(monthEntries);
  const series = useMemo(() => monthlySeries(filtered, month, 6), [filtered, month]);
  const pending = all.filter((e) => e.status === "pending");
  const rule = ws?.money_split ?? null;
  const splitResult = useMemo(() => (rule ? split(inMonth(all, month), rule) : null), [rule, all, month]);

  if (!ws) return null;
  if (!ws.modules?.money) return <ModuleOff module="money" />;
  if (!isFullMember(role)) {
    return (
      <PageContainer>
        <EmptyState illustration="chart" title={t("money.guest")} />
      </PageContainer>
    );
  }
  const words = { mln: t("money.mln"), k: t("money.thousand") };
  const monthLabel = (m: string) => `${f.months[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  const short = (m: string) => f.monthsShort[Number(m.slice(5, 7)) - 1];
  const who = (id: string) => (id === FUND ? t("money.fund") : (profiles[id]?.name ?? t("common.someone")));

  return (
    <PageContainer wide>
      <PageHeader
        title={t("money.title")}
        subtitle={t("money.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-success-soft text-success-fg"><Banknote className="size-5" /></span>}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog("expense")}><ArrowUpRight /> {t("money.addExpense")}</Button>
            <Button size="sm" onClick={() => setDialog("income")}><ArrowDownLeft /> {t("money.addIncome")}</Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border bg-card">
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t("money.prevMonth")}><ChevronLeft /></Button>
          <span className="min-w-32 px-2 text-center text-sm font-medium capitalize tnum" aria-live="polite">{monthLabel(month)}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t("money.nextMonth")}><ChevronRight /></Button>
        </div>
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger className="w-48" aria-label={t("task.project")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("money.allProjects")}</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={partner} onValueChange={setPartner}>
          <SelectTrigger className="w-44" aria-label={t("money.partner")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("money.allPartners")}</SelectItem>
            {members.filter((m) => m.role !== "guest").map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile icon={<ArrowDownLeft className="text-success" />} label={t("money.income")} value={moneyLabel(f.num, sum.income)} hint={sum.byCurrency.USD.income ? t("money.inUsd", { amount: moneyLabel(f.num, sum.byCurrency.USD.income, "USD") }) : undefined} />
        <StatTile icon={<ArrowUpRight className="text-danger" />} label={t("money.expense")} value={moneyLabel(f.num, sum.expense)} hint={sum.byCurrency.USD.expense ? t("money.inUsd", { amount: moneyLabel(f.num, sum.byCurrency.USD.expense, "USD") }) : undefined} />
        <StatTile icon={<Scale />} label={t("money.profit")} value={<span className={cn(sum.profit < 0 && "text-danger-fg")}>{moneyLabel(f.num, sum.profit)}</span>} hint={t("money.ratesHint", { rate: f.num(ws.usd_rate) })} />
      </div>

      {pending.length > 0 && (
        <section aria-labelledby="m-pending" className="mb-5 rounded-2xl border border-warning/40 bg-warning-soft/40 p-3">
          <h2 id="m-pending" className="mb-2 flex items-center gap-2 px-1 font-sans text-sm font-semibold tracking-normal text-warning-fg"><Clock className="size-4" /> {t("money.pendingTitle", { count: pending.length })}</h2>
          <ul className="space-y-1.5">
            {pending.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm">
                <span className="font-semibold tnum">{moneyLabel(f.num, Number(e.amount), e.currency)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{e.note || e.category || t("money.expense")} · {profiles[e.created_by ?? ""]?.name}</span>
                {e.created_by === uid ? (
                  <span className="text-xs text-muted-foreground">{t("money.waitingForPartner")}</span>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => decideEntry(e, false)}><X /> {t("money.reject")}</Button>
                    <Button size="sm" onClick={() => decideEntry(e, true)}><Check /> {t("money.approve")}</Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <ChartCard
          title={t("money.byMonth")}
          csvName="money-by-month"
          legend={[{ label: t("money.income"), color: SLOT[1], kind: "bar" }, { label: t("money.expense"), color: SLOT[3], kind: "bar" }]}
          table={{
            columns: [{ key: "month", label: t("money.month") }, { key: "income", label: t("money.income"), numeric: true }, { key: "expense", label: t("money.expense"), numeric: true }],
            rows: series.map((s) => ({ month: monthLabel(s.month), income: f.num(s.income), expense: f.num(s.expense) })),
          }}
        >
          <ResponsiveContainer>
            <BarChart data={series} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" tickFormatter={short} {...axisProps} />
              <YAxis {...axisProps} width={52} tickFormatter={(v: number) => compactUzs(f.num, v, words)} />
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip labelFormat={(l) => monthLabel(String(l))} format={(v) => moneyLabel(f.num, v)} />} />
              <Bar dataKey="income" name={t("money.income")} fill={SLOT[1]} {...barProps} />
              <Bar dataKey="expense" name={t("money.expense")} fill={SLOT[3]} {...barProps} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <section aria-labelledby="m-split" className="rounded-2xl border bg-card p-4 shadow-elev-1">
          <h2 id="m-split" className="font-sans text-sm font-semibold tracking-normal">{t("money.splitTitle")}</h2>
          {!splitResult ? (
            <p className="mt-2 text-13 text-muted-foreground">{t("money.splitOff")}</p>
          ) : (
            <>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("money.splitRule", { fund: f.num(ws.money_split!.fund_pct) })}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-13 tnum">
                <dt className="text-muted-foreground">{t("money.income")}</dt><dd className="text-right">{moneyLabel(f.num, splitResult.income)}</dd>
                <dt className="text-muted-foreground">{t("money.directCosts")}</dt><dd className="text-right">−{moneyLabel(f.num, splitResult.directCosts)}</dd>
                <dt className="text-muted-foreground">{t("money.fundShare", { pct: f.num(ws.money_split!.fund_pct) })}</dt><dd className="text-right">−{moneyLabel(f.num, splitResult.fund)}</dd>
                {splitResult.shares.map((s) => (
                  <div key={s.partnerId} className="contents">
                    <dt className="flex items-center gap-1.5"><UserAvatar profile={profiles[s.partnerId]} size={18} /> {who(s.partnerId)} · {f.num(s.pct)}%</dt>
                    <dd className="text-right font-semibold">{moneyLabel(f.num, s.amount)}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-4 mb-1.5 text-xs font-semibold text-muted-foreground">{t("money.whoOwes")}</h3>
              {splitResult.transfers.length === 0 ? (
                <p className="text-13 text-success-fg">{t("money.settled")}</p>
              ) : (
                <ul className="space-y-1 text-13">
                  {splitResult.transfers.map((tr, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="font-medium">{who(tr.from)}</span>
                      <ChevronRight className="size-3.5 text-muted-foreground" aria-label={t("money.pays")} />
                      <span className="font-medium">{who(tr.to)}</span>
                      <span className="ml-auto font-semibold tnum">{moneyLabel(f.num, tr.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      <section aria-labelledby="m-entries" className="space-y-2">
        <h2 id="m-entries" className="px-1 font-sans text-13 font-semibold tracking-normal text-muted-foreground">{t("money.entries", { count: monthEntries.length })}</h2>
        {monthEntries.length === 0 ? (
          <EmptyState compact illustration="chart" title={t("money.empty")} body={t("money.emptyBody")} />
        ) : (
          <ul className="divide-y rounded-2xl border bg-card shadow-elev-1">
            {monthEntries.map((e) => <EntryRow key={e.id} entry={e} onOpen={() => setDialog(e)} />)}
          </ul>
        )}
      </section>

      {dialog && <MoneyDialog ws={ws} entry={typeof dialog === "string" ? null : dialog} kind={typeof dialog === "string" ? dialog : dialog.kind} onClose={() => setDialog(null)} />}
    </PageContainer>
  );
}

function EntryRow({ entry, onOpen }: { entry: MoneyEntry; onOpen: () => void }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const project = useStore((s) => (entry.project_id ? s.data.projects[entry.project_id] : undefined));
  const partner = useStore((s) => (entry.partner_id ? s.data.profiles[entry.partner_id] : undefined));
  const income = entry.kind === "income";
  const inactive = entry.status !== "approved" || !counted([entry]).length;
  return (
    <li className="group flex items-center gap-3 px-3 py-2.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", income ? "bg-success-soft text-success-fg" : "bg-danger-soft text-danger-fg")}>
          {income ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{entry.note || entry.category || t(income ? "money.income" : "money.expense")}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{f.relativeDay(entry.date)}</span>
            {project && <span>{project.name}</span>}
            <span>{t(`money.methods.${entry.method}`)}</span>
            {entry.direct && <span>{t("money.direct")}</span>}
            {partner && <span className="inline-flex items-center gap-1"><UserAvatar profile={partner} size={14} /> {partner.name}</span>}
            {entry.status === "pending" && <span className="font-medium text-warning-fg">{t("money.status.pending")}</span>}
            {entry.status === "rejected" && <span className="font-medium text-danger-fg">{t("money.status.rejected")}</span>}
          </span>
        </span>
        <span className={cn("shrink-0 text-right tnum", inactive && "text-muted-foreground line-through decoration-muted-foreground/50")}>
          <span className={cn("block text-sm font-semibold", !inactive && (income ? "text-success-fg" : ""))}>
            {income ? "+" : "−"}{moneyLabel(f.num, Number(entry.amount), entry.currency)}
          </span>
          {entry.currency === "USD" && <span className="block text-2xs text-muted-foreground">{moneyLabel(f.num, toUzs(entry))}</span>}
        </span>
      </button>
      <button type="button" onClick={() => deleteMoneyEntry(entry)} aria-label={t("common.delete")} className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}
