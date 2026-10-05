import { describe, expect, it } from "vitest";
import { partOfDay, partOfDayIn } from "@/lib/dates";
import { focusSummary } from "@/lib/focus-stats";
import { goalPace, goalProgress, krProgress } from "@/lib/goals";
import { healthReason, suggestHealth } from "@/lib/health";
import { computeRemindAt } from "@/lib/reminders";
import { nextKeyDate, nextKeyDateOf } from "@/lib/tasks/key-dates";
import { initials } from "@/lib/text";

describe("initials", () => {
  it("skips brackets, digits and punctuation", () => {
    expect(initials("Hamkor (demo)")).toBe("H");
    expect(initials("Konsultant (demo)")).toBe("K");
    expect(initials("Fayzullo Oripov")).toBe("FO");
    expect(initials("  Ali  ")).toBe("A");
    expect(initials("007 Bond")).toBe("B");
    expect(initials("Олим Каримов")).toBe("ОК");
    expect(initials("")).toBe("?");
    expect(initials("(demo)")).toBe("?");
  });
});

describe("greeting part of day", () => {
  it("uses tong 05–11, kun 11–17, kech 17–22, tun 22–05", () => {
    expect([4, 5, 10, 11, 16, 17, 21, 22].map(partOfDay)).toEqual(["night", "morning", "morning", "afternoon", "afternoon", "evening", "evening", "night"]);
  });
  it("is computed in the user's time zone, not the machine's", () => {
    // 07:30 UTC is 12:30 in Tashkent and 03:30 in New York
    const at = new Date("2026-10-05T07:30:00Z");
    expect(partOfDayIn("Asia/Tashkent", at)).toBe("afternoon");
    expect(partOfDayIn("America/New_York", at)).toBe("night");
  });
});

describe("next key date (one rule everywhere)", () => {
  const today = "2026-10-05";
  it("takes the earliest of due date and deadline that is not past", () => {
    expect(nextKeyDate({ due_date: "2026-10-07", deadline: "2026-10-10" }, today)).toEqual({ date: "2026-10-07", kind: "due" });
    expect(nextKeyDate({ due_date: "2026-10-01", deadline: "2026-10-10" }, today)).toEqual({ date: "2026-10-10", kind: "deadline" });
    expect(nextKeyDate({ due_date: null, deadline: null }, today)).toBeNull();
  });
  it("prefers the deadline when both fall on the same day", () => {
    expect(nextKeyDate({ due_date: "2026-10-09", deadline: "2026-10-09" }, today)?.kind).toBe("deadline");
  });
  it("finds a project's next date across its tasks", () => {
    const next = nextKeyDateOf([{ due_date: "2026-10-20", deadline: null, id: "a" }, { due_date: null, deadline: "2026-10-08", id: "b" }], today);
    expect(next?.task.id).toBe("b");
  });
});

describe("goal progress explained", () => {
  const krs = [
    { start_value: 0, target: 120, current: 54 },
    { start_value: 8, target: 15, current: 11 },
  ];
  it("measures each key result from its start value", () => {
    expect(krProgress(krs[0])).toBeCloseTo(45);
    expect(krProgress(krs[1])).toBeCloseTo(42.857, 2);
    expect(goalProgress(krs)).toBeCloseTo(43.93, 1);
  });
  it("compares progress with the share of time passed", () => {
    const pace = goalPace({ start_date: "2026-10-01", target_date: "2026-10-31", created_at: "2026-09-20T00:00:00Z" }, krs, "2026-10-05");
    expect(Math.round(pace!.elapsed)).toBe(13);
    expect(pace!.pace).toBe("ahead");
  });
});

describe("health reason", () => {
  const t = (key: string, v?: Record<string, string | number>) => `${key}:${JSON.stringify(v ?? {})}`;
  it("lists days left, percent done and overdue count", () => {
    const tasks = [
      { status: "done" as const, due_date: null, deadline: null, parent_id: null, deleted_at: null },
      { status: "todo" as const, due_date: "2026-10-01", deadline: null, parent_id: null, deleted_at: null },
    ];
    const r = suggestHealth({ target_date: "2026-10-10", status: "active" }, tasks, "2026-10-05");
    expect(r.health).toBe("at_risk");
    const reason = healthReason(t, { health_manual: false, health: null, health_note: null }, r);
    expect(reason).toContain('health.partLeft:{"days":5}');
    expect(reason).toContain('health.partDone:{"percent":50}');
    expect(reason).toContain('health.partOverdue:{"count":1}');
  });
  it("shows the owner's note for a manual health", () => {
    const r = suggestHealth({ target_date: null, status: "active" }, [], "2026-10-05");
    expect(healthReason(t, { health_manual: true, health: "at_risk", health_note: "Mijoz javob bermayapti" }, r)).toContain("Mijoz javob bermayapti");
  });
});

describe("focus summary", () => {
  it("counts only finished focus sessions in the range", () => {
    const entries = [
      { user_id: "u", source: "focus" as const, started_at: "2026-10-05T05:00:00Z", minutes: 25 },
      { user_id: "u", source: "focus" as const, started_at: "2026-10-05T06:00:00Z", minutes: 25 },
      { user_id: "u", source: "manual" as const, started_at: "2026-10-05T07:00:00Z", minutes: 40 },
      { user_id: "x", source: "focus" as const, started_at: "2026-10-05T07:00:00Z", minutes: 25 },
      { user_id: "u", source: "focus" as const, started_at: "2026-10-01T05:00:00Z", minutes: 50 },
    ];
    expect(focusSummary(entries, "u", "Asia/Tashkent", "2026-10-05", "2026-10-05")).toEqual({ minutes: 50, sessions: 2 });
    expect(focusSummary(entries, "u", "Asia/Tashkent", "2026-09-28", "2026-10-05")).toEqual({ minutes: 100, sessions: 3 });
  });
});

describe("default reminder timing", () => {
  it("is 15 minutes before a timed task and 09:00 on the day for an all-day task", () => {
    expect(computeRemindAt("2026-10-06", "2026-10-06T05:00:00.000Z", "Asia/Tashkent", "15m")?.toISOString()).toBe("2026-10-06T04:45:00.000Z");
    expect(computeRemindAt("2026-10-06", null, "Asia/Tashkent", "15m")?.toISOString()).toBe("2026-10-06T04:00:00.000Z");
    expect(computeRemindAt("2026-10-06", null, "Asia/Tashkent", "1d")?.toISOString()).toBe("2026-10-05T04:00:00.000Z");
  });
});
