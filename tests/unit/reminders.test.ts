import { describe, expect, it } from "vitest";
import { computeRemindAt, deliveryTime, dueDailySlots, inQuietHours, quietHoursEnd, type DailySlotProfile } from "@/lib/reminders";

const TZ = "Asia/Tashkent";

describe("computeRemindAt", () => {
  it("uses 09:00 local for all-day tasks", () => {
    expect(computeRemindAt("2026-10-06", null, TZ, "at_due")?.toISOString()).toBe("2026-10-06T04:00:00.000Z");
    expect(computeRemindAt("2026-10-06", null, TZ, "1d")?.toISOString()).toBe("2026-10-05T04:00:00.000Z");
  });
  it("subtracts offsets from the exact due time", () => {
    const at = "2026-10-06T10:30:00.000Z";
    expect(computeRemindAt("2026-10-06", at, TZ, "15m")?.toISOString()).toBe("2026-10-06T10:15:00.000Z");
    expect(computeRemindAt("2026-10-06", at, TZ, "1h")?.toISOString()).toBe("2026-10-06T09:30:00.000Z");
  });
  it("returns null without a due date", () => {
    expect(computeRemindAt(null, null, TZ, "at_due")).toBeNull();
  });
});

describe("quiet hours", () => {
  const q = { enabled: true, start: "22:00:00", end: "07:00:00" };

  it("detects windows that cross midnight", () => {
    expect(inQuietHours(new Date("2026-10-05T17:30:00Z"), TZ, q)).toBe(true); // 22:30 local
    expect(inQuietHours(new Date("2026-10-05T01:00:00Z"), TZ, q)).toBe(true); // 06:00 local
    expect(inQuietHours(new Date("2026-10-05T02:00:00Z"), TZ, q)).toBe(false); // 07:00 local
    expect(inQuietHours(new Date("2026-10-05T12:00:00Z"), TZ, q)).toBe(false); // 17:00 local
  });

  it("queues until the window ends — same night or next morning", () => {
    expect(quietHoursEnd(new Date("2026-10-05T17:30:00Z"), TZ, q).toISOString()).toBe("2026-10-06T02:00:00.000Z");
    expect(quietHoursEnd(new Date("2026-10-05T00:30:00Z"), TZ, q).toISOString()).toBe("2026-10-05T02:00:00.000Z");
  });

  it("delivers immediately outside quiet hours or when disabled", () => {
    const now = new Date("2026-10-05T17:30:00Z");
    expect(deliveryTime(now, TZ, { ...q, enabled: false })).toBe(now);
    const noon = new Date("2026-10-05T07:00:00Z");
    expect(deliveryTime(noon, TZ, q)).toBe(noon);
  });

  it("handles same-day windows (13:00 → 14:00)", () => {
    const lunch = { enabled: true, start: "13:00", end: "14:00" };
    expect(inQuietHours(new Date("2026-10-05T08:30:00Z"), TZ, lunch)).toBe(true);
    expect(inQuietHours(new Date("2026-10-05T09:30:00Z"), TZ, lunch)).toBe(false);
  });
});

describe("daily slots", () => {
  const base: DailySlotProfile = {
    timezone: TZ,
    digest_enabled: true,
    digest_time: "07:30:00",
    review_enabled: true,
    review_dow: 7,
    review_time: "09:00:00",
    overdue_nudge_enabled: true,
    last_digest_on: null,
    last_review_on: null,
    last_overdue_nudge_on: null,
  };

  it("sends the digest at or after the digest time", () => {
    expect(dueDailySlots(base, new Date("2026-10-05T02:29:00Z")).map((s) => s.kind)).toEqual([]); // 07:29
    expect(dueDailySlots(base, new Date("2026-10-05T02:30:00Z")).map((s) => s.kind)).toEqual(["digest", "overdue"]); // 07:30
  });

  it("does not resend once sent today", () => {
    const sent = { ...base, last_digest_on: "2026-10-05", last_overdue_nudge_on: "2026-10-05" };
    expect(dueDailySlots(sent, new Date("2026-10-05T03:00:00Z"))).toEqual([]);
  });

  it("sends the weekly review only on the review weekday", () => {
    const sunday = new Date("2026-10-11T04:00:00Z"); // Sunday 09:00
    expect(dueDailySlots({ ...base, digest_enabled: false, overdue_nudge_enabled: false }, sunday)).toEqual([
      { kind: "review", date: "2026-10-11" },
    ]);
    const monday = new Date("2026-10-12T04:00:00Z");
    expect(dueDailySlots({ ...base, digest_enabled: false, overdue_nudge_enabled: false }, monday)).toEqual([]);
  });

  it("gives up on slots missed by more than three hours", () => {
    expect(dueDailySlots(base, new Date("2026-10-05T06:00:00Z"))).toEqual([]); // 11:00 local
  });
});
