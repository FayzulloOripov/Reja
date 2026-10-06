// Money: totals in UZS and the partner split ("direct costs, then 10% to a common fund, then
// 50/50"), with who owes whom. Pure functions, unit-tested.

import type { Currency, ISODate, MoneyEntry, MoneySplit } from "./types";

type Entry = Pick<MoneyEntry, "kind" | "amount" | "currency" | "rate" | "date" | "status" | "partner_id" | "direct" | "deleted_at" | "project_id"> & {
  amount_uzs?: number | null;
};

/** UZS value of an entry (the database computes the same as amount_uzs). */
export function toUzs(e: Pick<Entry, "amount" | "currency" | "rate" | "amount_uzs">): number {
  if (e.amount_uzs != null && Number.isFinite(Number(e.amount_uzs))) return Number(e.amount_uzs);
  return e.currency === "USD" ? Number(e.amount) * Number(e.rate ?? 0) : Number(e.amount);
}

/** Entries that count: not deleted, not rejected, not waiting for approval. */
export function counted<T extends Entry>(entries: T[]): T[] {
  return entries.filter((e) => !e.deleted_at && e.status === "approved");
}

export function inMonth<T extends Pick<Entry, "date">>(entries: T[], month: string): T[] {
  return entries.filter((e) => e.date.slice(0, 7) === month);
}

export interface Totals {
  income: number;
  expense: number;
  profit: number;
  /** original amounts per currency */
  byCurrency: Record<Currency, { income: number; expense: number }>;
}

export function totals(entries: Entry[]): Totals {
  const out: Totals = { income: 0, expense: 0, profit: 0, byCurrency: { UZS: { income: 0, expense: 0 }, USD: { income: 0, expense: 0 } } };
  for (const e of counted(entries)) {
    out[e.kind] += toUzs(e);
    out.byCurrency[e.currency][e.kind] += Number(e.amount);
  }
  out.profit = out.income - out.expense;
  return out;
}

/** Monthly income/expense for the last n months ending with `month` (YYYY-MM), oldest first. */
export function monthlySeries(entries: Entry[], month: string, n: number): { month: string; income: number; expense: number }[] {
  const [y, m] = month.split("-").map(Number);
  const out: { month: string; income: number; expense: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    const t = totals(inMonth(entries, key));
    out.push({ month: key, income: t.income, expense: t.expense });
  }
  return out;
}

export const FUND = "fund";

export interface SplitResult {
  income: number;
  directCosts: number;
  /** income − direct costs */
  net: number;
  fund: number;
  /** expenses that are not direct costs are paid from the fund */
  overhead: number;
  shares: { partnerId: string; pct: number; amount: number; held: number; position: number }[];
  /** money that should move so everyone ends up with their share */
  transfers: { from: string; to: string; amount: number }[];
}

/**
 * Split a period's money by the rule. Each partner is entitled to their share of
 * (net − fund); what they actually hold is the income they received minus the expenses they paid.
 * Entries without a partner sit in the common fund. Positive position = holds too much (pays out).
 */
export function split(entries: Entry[], rule: MoneySplit): SplitResult {
  const list = counted(entries);
  const sum = (f: (e: Entry) => boolean) => list.filter(f).reduce((n, e) => n + toUzs(e), 0);
  const income = sum((e) => e.kind === "income");
  const directCosts = sum((e) => e.kind === "expense" && e.direct);
  const overhead = sum((e) => e.kind === "expense" && !e.direct);
  const net = income - directCosts;
  const fund = net > 0 ? (net * rule.fund_pct) / 100 : 0;
  const pctTotal = Object.values(rule.shares).reduce((n, p) => n + p, 0) || 100;
  const held = (pid: string | null) => sum((e) => e.partner_id === pid && e.kind === "income") - sum((e) => e.partner_id === pid && e.kind === "expense");

  const partnerIds = Object.keys(rule.shares);
  const known = new Set(partnerIds);
  const shares = partnerIds.map((partnerId) => {
    const pct = rule.shares[partnerId];
    const amount = ((net - fund) * pct) / pctTotal;
    const h = held(partnerId);
    return { partnerId, pct, amount, held: h, position: h - amount };
  });
  // the fund holds unassigned entries (and anything held by people outside the rule)
  const fundHeld = list.filter((e) => !e.partner_id || !known.has(e.partner_id)).reduce((n, e) => n + (e.kind === "income" ? 1 : -1) * toUzs(e), 0);
  const fundPosition = fundHeld - (fund - overhead);

  const parties = [...shares.map((s) => ({ id: s.partnerId, pos: s.position })), { id: FUND, pos: fundPosition }];
  const transfers: SplitResult["transfers"] = [];
  const payers = parties.filter((p) => p.pos > 0.5).sort((a, b) => b.pos - a.pos);
  const receivers = parties.filter((p) => p.pos < -0.5).sort((a, b) => a.pos - b.pos);
  for (const payer of payers) {
    for (const rcv of receivers) {
      if (payer.pos <= 0.5) break;
      if (rcv.pos >= -0.5) continue;
      const amount = Math.min(payer.pos, -rcv.pos);
      transfers.push({ from: payer.id, to: rcv.id, amount: Math.round(amount) });
      payer.pos -= amount;
      rcv.pos += amount;
    }
  }
  return { income, directCosts, net, fund, overhead, shares, transfers };
}

/** Whether a new expense would wait for approval (mirrors the database rule). */
export function needsApproval(kind: Entry["kind"], uzs: number, threshold: number | null | undefined): boolean {
  return kind === "expense" && threshold != null && uzs >= Number(threshold);
}

/** "2026-10" for the month containing a date. */
export function monthOf(date: ISODate): string {
  return date.slice(0, 7);
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** "12 500 000 soʻm" or "$1 200" with the app's number formatting. */
export function moneyLabel(num: (v: number, digits?: number) => string, amount: number, currency: Currency | "UZS" = "UZS"): string {
  return currency === "USD" ? `$${num(amount, amount % 1 ? 2 : 0)}` : `${num(Math.round(amount))} soʻm`;
}

/** Short form for tiles and cards: "12,5 mln", "850 ming". */
export function compactUzs(num: (v: number, digits?: number) => string, uzs: number, words: { mln: string; k: string }): string {
  const a = Math.abs(uzs);
  if (a >= 1_000_000) return `${num(uzs / 1_000_000, a >= 100_000_000 ? 0 : 1)} ${words.mln}`;
  if (a >= 10_000) return `${num(uzs / 1000, 0)} ${words.k}`;
  return num(uzs);
}
