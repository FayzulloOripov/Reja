import { describe, expect, it } from "vitest";
import { bestStreak, currentStreak } from "@/lib/habits";

const daily = { days: [1, 2, 3, 4, 5, 6, 7] };
const weekdays = { days: [1, 2, 3, 4, 5] };

describe("habit streaks", () => {
  it("counts back from today, or from yesterday if today is unchecked", () => {
    const done = new Set(["2026-10-03", "2026-10-04", "2026-10-05"]);
    expect(currentStreak(daily, done, "2026-10-05")).toBe(3);
    expect(currentStreak(daily, done, "2026-10-06")).toBe(3);
    expect(currentStreak(daily, done, "2026-10-07")).toBe(0);
  });

  it("skips unscheduled days", () => {
    // Fri 2 Oct and Mon 5 Oct done; the weekend is not scheduled
    const done = new Set(["2026-10-02", "2026-10-05"]);
    expect(currentStreak(weekdays, done, "2026-10-05")).toBe(2);
  });

  it("finds the best streak in a range", () => {
    const done = new Set(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"]);
    expect(bestStreak(daily, done, "2026-09-01", "2026-09-10")).toBe(3);
  });
});
