import { describe, expect, it } from "vitest";
import { autoValue } from "@/lib/goals";
import { FUND, monthlySeries, needsApproval, split, totals } from "@/lib/money";
import { pipelineStats, staleReason } from "@/lib/pipeline";
import type { Deal, DealStage, MoneyEntry } from "@/lib/types";

const TZ = "Asia/Tashkent";
const e = (p: Partial<MoneyEntry>): MoneyEntry =>
  ({
    id: Math.random().toString(36), workspace_id: "w", project_id: null, kind: "income", amount: 0, currency: "UZS", rate: null,
    amount_uzs: undefined as unknown as number, date: "2026-10-05", method: "cash", partner_id: null, category: null, note: null,
    direct: false, status: "approved", approved_by: null, approved_at: null, created_by: "a", deleted_at: null, created_at: "", updated_at: "", ...p,
  }) as MoneyEntry;

describe("money totals", () => {
  it("adds UZS and USD (at the entry's rate), skipping pending and rejected", () => {
    const t = totals([
      e({ amount: 1_000_000 }),
      e({ amount: 100, currency: "USD", rate: 12_500 }),
      e({ kind: "expense", amount: 300_000 }),
      e({ kind: "expense", amount: 9_000_000, status: "pending" }),
      e({ kind: "income", amount: 5, status: "rejected" }),
    ]);
    expect(t).toMatchObject({ income: 2_250_000, expense: 300_000, profit: 1_950_000 });
    expect(t.byCurrency.USD.income).toBe(100);
  });
  it("monthly series, oldest first", () => {
    const s = monthlySeries([e({ amount: 10, date: "2026-09-02" }), e({ amount: 20, date: "2026-10-01" })], "2026-10", 3);
    expect(s).toEqual([
      { month: "2026-08", income: 0, expense: 0 },
      { month: "2026-09", income: 10, expense: 0 },
      { month: "2026-10", income: 20, expense: 0 },
    ]);
  });
  it("large expenses need approval", () => {
    expect(needsApproval("expense", 5_000_000, 5_000_000)).toBe(true);
    expect(needsApproval("expense", 4_999_999, 5_000_000)).toBe(false);
    expect(needsApproval("income", 9e9, 5_000_000)).toBe(false);
    expect(needsApproval("expense", 9e9, null)).toBe(false);
  });
});

describe("partner split: direct costs, 10% fund, then 50/50", () => {
  const rule = { fund_pct: 10, shares: { a: 50, b: 50 } };
  it("computes shares and who owes whom", () => {
    // A received 10M and paid 2M of direct costs; B received 2M; nobody paid overhead
    const r = split([e({ amount: 10_000_000, partner_id: "a" }), e({ amount: 2_000_000, partner_id: "b" }), e({ kind: "expense", amount: 2_000_000, partner_id: "a", direct: true })], rule);
    expect(r).toMatchObject({ income: 12_000_000, directCosts: 2_000_000, net: 10_000_000, fund: 1_000_000, overhead: 0 });
    expect(r.shares.map((s) => [s.partnerId, s.amount, s.held])).toEqual([["a", 4_500_000, 8_000_000], ["b", 4_500_000, 2_000_000]]);
    // A holds 3.5M too much: 2.5M to B, 1M to the fund
    expect(r.transfers).toEqual([{ from: "a", to: "b", amount: 2_500_000 }, { from: "a", to: FUND, amount: 1_000_000 }]);
  });
  it("overhead is paid from the fund, so a partner who paid it is owed", () => {
    const r = split([e({ amount: 10_000_000, partner_id: "a" }), e({ kind: "expense", amount: 500_000, partner_id: "b" })], rule);
    expect(r.overhead).toBe(500_000);
    // A holds 10M, entitled 4.5M; B holds −0.5M, entitled 4.5M; fund should hold 0.5M
    expect(r.transfers).toEqual([{ from: "a", to: "b", amount: 5_000_000 }, { from: "a", to: FUND, amount: 500_000 }]);
  });
  it("a loss creates no fund", () => {
    expect(split([e({ kind: "expense", amount: 1_000, direct: true, partner_id: "a" })], rule).fund).toBe(0);
  });
});

describe("pipeline", () => {
  const stages: Record<string, DealStage> = {
    o: { id: "o", kind: "open" } as DealStage,
    w: { id: "w", kind: "won" } as DealStage,
    l: { id: "l", kind: "lost" } as DealStage,
  };
  const d = (p: Partial<Deal>): Deal => ({ id: Math.random().toString(36), workspace_id: "w", stage_id: "o", value: null, currency: "UZS", deleted_at: null, closed_at: null, stage_changed_at: "2026-10-01T05:00:00Z", next_step: "Call", next_step_date: null, ...p }) as Deal;
  it("stale: overdue next step, no move for 14 days, or no next step", () => {
    expect(staleReason(d({ next_step_date: "2026-10-05" }), stages.o, "2026-10-06", TZ)).toBe("step_overdue");
    expect(staleReason(d({ stage_changed_at: "2026-09-20T05:00:00Z" }), stages.o, "2026-10-06", TZ)).toBe("no_move");
    expect(staleReason(d({ next_step: null }), stages.o, "2026-10-06", TZ)).toBe("no_step");
    expect(staleReason(d({}), stages.o, "2026-10-06", TZ)).toBeNull();
    expect(staleReason(d({ next_step: null }), stages.w, "2026-10-06", TZ)).toBeNull();
  });
  it("conversion counts deals closed in the period", () => {
    const s = pipelineStats(
      [d({ value: 100, currency: "USD" }), d({ stage_id: "w", value: 1_000_000, closed_at: "2026-10-02T05:00:00Z" }), d({ stage_id: "l", closed_at: "2026-10-03T05:00:00Z" }), d({ stage_id: "l", closed_at: "2026-08-01T05:00:00Z" })],
      stages, 12_800, "2026-10-01", "2026-10-31", TZ,
    );
    expect(s).toEqual({ open: 1, openValue: 1_280_000, won: 1, wonValue: 1_000_000, lost: 1, conversion: 50 });
  });
});

describe("key results fed by data", () => {
  const goal = { start_date: "2026-10-01", target_date: "2026-10-31", created_at: "2026-09-20T00:00:00Z" };
  const data = {
    money: [e({ amount: 54_000_000, date: "2026-10-03" }), e({ amount: 100, currency: "USD" as const, rate: 12_800, date: "2026-10-04" }), e({ amount: 9_000_000, date: "2026-09-30" })],
    deals: [{ stage_id: "w", closed_at: "2026-10-02T05:00:00Z", deleted_at: null, workspace_id: "w", project_id: null }, { stage_id: "w", closed_at: "2026-09-02T05:00:00Z", deleted_at: null, workspace_id: "w", project_id: null }],
    stages: { w: { kind: "won" as const } },
    tasks: [
      { id: "t1", status: "done" as const, completed_at: "2026-10-03T08:00:00Z", deleted_at: null, workspace_id: "w" },
      { id: "t2", status: "done" as const, completed_at: "2026-10-03T08:00:00Z", deleted_at: null, workspace_id: "w" },
      { id: "t3", status: "todo" as const, completed_at: null, deleted_at: null, workspace_id: "w" },
    ],
    taskLabels: [{ task_id: "t1", label_id: "L" }, { task_id: "t3", label_id: "L" }],
  };
  const kr = (source: "manual" | "money_income" | "pipeline_won" | "tasks_done", cfg = {}) => ({ source, source_config: cfg, workspace_id: "w" });
  it("income this month, in millions", () => {
    expect(autoValue(kr("money_income", { scale: 1_000_000 }), goal, data, "2026-10-06", TZ)).toBe(55.28);
  });
  it("won deals and labelled done tasks within the goal's period; manual stays manual", () => {
    expect(autoValue(kr("pipeline_won"), goal, data, "2026-10-06", TZ)).toBe(1);
    expect(autoValue(kr("tasks_done", { label_id: "L" }), goal, data, "2026-10-06", TZ)).toBe(1);
    expect(autoValue(kr("manual"), goal, data, "2026-10-06", TZ)).toBeNull();
  });
});
