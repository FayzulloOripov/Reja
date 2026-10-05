import { describe, expect, it } from "vitest";
import { completedPerWeek, createdVsCompleted, lastWeeks, onTimeRate, overdueTrend, progressOverTime } from "@/lib/reports";

const TZ = "Asia/Tashkent";
const today = "2026-10-05"; // Monday
const weeks = lastWeeks(today, 3); // 21 Sep, 28 Sep, 5 Oct

const task = (p: Partial<{ status: string; completed_at: string | null; created_at: string; due_date: string | null; deadline: string | null }>) => ({
  status: "todo",
  completed_at: null,
  created_at: "2026-09-20T05:00:00Z",
  due_date: null,
  deadline: null,
  deleted_at: null,
  ...p,
}) as never;

describe("report metrics", () => {
  it("buckets weeks starting on Monday", () => {
    expect(weeks.map((w) => w.start)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
  });

  it("counts completions per local week (late-night UTC counts as the next local day)", () => {
    const tasks = [
      task({ status: "done", completed_at: "2026-09-27T20:00:00Z" }), // Mon 28 Sep 01:00 in Tashkent
      task({ status: "done", completed_at: "2026-09-24T08:00:00Z" }),
    ];
    expect(completedPerWeek(tasks, weeks, TZ).map((w) => w.count)).toEqual([1, 1, 0]);
  });

  it("computes the on-time rate against the later of due date and deadline", () => {
    const tasks = [
      task({ status: "done", completed_at: "2026-09-29T08:00:00Z", due_date: "2026-09-29" }),
      task({ status: "done", completed_at: "2026-10-01T08:00:00Z", due_date: "2026-09-29" }),
      task({ status: "done", completed_at: "2026-10-01T08:00:00Z", due_date: "2026-09-29", deadline: "2026-10-02" }),
    ];
    expect(onTimeRate(tasks, weeks, TZ)[1]).toEqual({ week: "2026-09-28", rate: 67, total: 3 });
  });

  it("counts tasks that were overdue at the end of each week", () => {
    const tasks = [
      task({ due_date: "2026-09-22" }), // still open
      task({ due_date: "2026-09-22", status: "done", completed_at: "2026-09-30T08:00:00Z" }),
    ];
    expect(overdueTrend(tasks, weeks, TZ).map((w) => w.count)).toEqual([2, 1, 1]);
  });

  it("tracks created vs completed and cumulative progress", () => {
    const tasks = [
      task({ created_at: "2026-09-22T08:00:00Z", status: "done", completed_at: "2026-09-23T08:00:00Z" }),
      task({ created_at: "2026-09-29T08:00:00Z" }),
    ];
    expect(createdVsCompleted(tasks, weeks, TZ).map((w) => [w.created, w.completed])).toEqual([[1, 1], [1, 0], [0, 0]]);
    expect(progressOverTime(tasks, weeks, TZ).map((w) => w.percent)).toEqual([100, 50, 50]);
  });
});
