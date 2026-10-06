// Pipeline numbers: value per stage, conversion, and deals that need attention.

import { dateIn, diffDays } from "./dates";
import { toUzs } from "./money";
import type { Deal, DealStage, ISODate } from "./types";

/** Days without a stage change after which an open deal counts as stale. */
export const STALE_DAYS = 14;

export const DEFAULT_STAGES: { name: { uz: string; en: string }; kind: DealStage["kind"]; color: string }[] = [
  { name: { uz: "Yangi lid", en: "New lead" }, kind: "open", color: "teal" },
  { name: { uz: "Aloqa oʻrnatildi", en: "Contacted" }, kind: "open", color: "sky" },
  { name: { uz: "Taklif yuborildi", en: "Proposal sent" }, kind: "open", color: "indigo" },
  { name: { uz: "Muzokara", en: "Negotiation" }, kind: "open", color: "amber" },
  { name: { uz: "Yutildi", en: "Won" }, kind: "won", color: "emerald" },
  { name: { uz: "Yutqazildi", en: "Lost" }, kind: "lost", color: "rose" },
];

export function dealUzs(d: Pick<Deal, "value" | "currency">, usdRate: number): number {
  if (d.value == null) return 0;
  return toUzs({ amount: Number(d.value), currency: d.currency, rate: usdRate });
}

export type StaleReason = "no_move" | "step_overdue" | "no_step";

/** Why an open deal needs attention (null when it is fine). */
export function staleReason(d: Pick<Deal, "stage_changed_at" | "next_step" | "next_step_date">, stage: Pick<DealStage, "kind"> | undefined, today: ISODate, tz: string): StaleReason | null {
  if (!stage || stage.kind !== "open") return null;
  if (d.next_step_date && d.next_step_date < today) return "step_overdue";
  if (diffDays(dateIn(tz, d.stage_changed_at), today) >= STALE_DAYS) return "no_move";
  if (!d.next_step?.trim()) return "no_step";
  return null;
}

export interface PipelineStats {
  open: number;
  openValue: number;
  won: number;
  wonValue: number;
  lost: number;
  /** won ÷ (won + lost), 0–100; null when nothing has closed */
  conversion: number | null;
}

/** Totals for deals closed in [from, to] plus everything still open. */
export function pipelineStats(deals: Deal[], stages: Record<string, DealStage>, usdRate: number, from: ISODate, to: ISODate, tz: string): PipelineStats {
  const live = deals.filter((d) => !d.deleted_at);
  const kind = (d: Deal) => stages[d.stage_id]?.kind;
  const closedIn = (d: Deal) => d.closed_at && dateIn(tz, d.closed_at) >= from && dateIn(tz, d.closed_at) <= to;
  const open = live.filter((d) => kind(d) === "open");
  const won = live.filter((d) => kind(d) === "won" && closedIn(d));
  const lost = live.filter((d) => kind(d) === "lost" && closedIn(d));
  const sum = (list: Deal[]) => list.reduce((n, d) => n + dealUzs(d, usdRate), 0);
  return {
    open: open.length,
    openValue: sum(open),
    won: won.length,
    wonValue: sum(won),
    lost: lost.length,
    conversion: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : null,
  };
}
