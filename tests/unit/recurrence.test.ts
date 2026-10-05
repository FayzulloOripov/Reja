import { describe, expect, it } from "vitest";
import { nextOccurrence, upcomingOccurrences } from "@/lib/recurrence";

const TASHKENT = "Asia/Tashkent"; // UTC+5, no daylight saving
const NEW_YORK = "America/New_York"; // DST: 2026-11-01 back to EST, 2027-03-14 forward to EDT

describe("nextOccurrence in a zone without DST", () => {
  const now = new Date("2026-10-05T06:00:00Z"); // 11:00 Tashkent, Monday

  it("moves a daily all-day task to tomorrow", () => {
    expect(nextOccurrence("FREQ=DAILY", { dueDate: "2026-10-05", dueAt: null }, TASHKENT, now)).toEqual({
      dueDate: "2026-10-06",
      dueAt: null,
    });
  });

  it("keeps the local time for timed tasks", () => {
    // 09:00 Tashkent = 04:00 UTC
    const r = nextOccurrence("FREQ=DAILY", { dueDate: "2026-10-05", dueAt: "2026-10-05T04:00:00Z" }, TASHKENT, now);
    expect(r).toEqual({ dueDate: "2026-10-06", dueAt: "2026-10-06T04:00:00.000Z" });
  });

  it("schedules weekly tasks on their weekday", () => {
    const r = nextOccurrence("FREQ=WEEKLY;BYDAY=FR", { dueDate: "2026-10-09", dueAt: null }, TASHKENT, now);
    expect(r?.dueDate).toBe("2026-10-16");
  });

  it("skips past occurrences when an overdue task is completed", () => {
    const r = nextOccurrence("FREQ=DAILY", { dueDate: "2026-09-28", dueAt: null }, TASHKENT, now);
    expect(r?.dueDate).toBe("2026-10-06");
    const w = nextOccurrence("FREQ=WEEKLY;BYDAY=MO", { dueDate: "2026-09-21", dueAt: null }, TASHKENT, now);
    expect(w?.dueDate).toBe("2026-10-12");
  });

  it("handles work-week rules (Mon–Sat) and monthly end-of-month", () => {
    const sat = new Date("2026-10-10T06:00:00Z");
    const r = nextOccurrence("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA", { dueDate: "2026-10-10", dueAt: null }, TASHKENT, sat);
    expect(r?.dueDate).toBe("2026-10-12"); // Sunday is skipped
    const m = nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=-1", { dueDate: "2026-10-31", dueAt: null }, TASHKENT, new Date("2026-10-31T06:00:00Z"));
    expect(m?.dueDate).toBe("2026-11-30");
  });

  it("returns null for invalid rules", () => {
    expect(nextOccurrence("nonsense", { dueDate: "2026-10-05", dueAt: null }, TASHKENT, now)).toBeNull();
  });
});

describe("nextOccurrence across daylight saving time", () => {
  it("keeps 09:00 local when clocks fall back (EDT → EST)", () => {
    // Fri 30 Oct 2026 09:00 EDT = 13:00Z; next weekly is Fri 6 Nov 09:00 EST = 14:00Z
    const now = new Date("2026-10-30T15:00:00Z");
    const r = nextOccurrence("FREQ=WEEKLY", { dueDate: "2026-10-30", dueAt: "2026-10-30T13:00:00Z" }, NEW_YORK, now);
    expect(r).toEqual({ dueDate: "2026-11-06", dueAt: "2026-11-06T14:00:00.000Z" });
  });

  it("keeps 09:00 local when clocks spring forward (EST → EDT)", () => {
    // Sat 13 Mar 2027 09:00 EST = 14:00Z; next daily is Sun 14 Mar 09:00 EDT = 13:00Z
    const now = new Date("2027-03-13T16:00:00Z");
    const r = nextOccurrence("FREQ=DAILY", { dueDate: "2027-03-13", dueAt: "2027-03-13T14:00:00Z" }, NEW_YORK, now);
    expect(r).toEqual({ dueDate: "2027-03-14", dueAt: "2027-03-14T13:00:00.000Z" });
  });

  it("uses the local date, not the UTC date, near midnight", () => {
    // 23:30 Tashkent on 5 Oct is 18:30Z the same day; in New York 22:30 local on 5 Oct is 02:30Z on 6 Oct
    const now = new Date("2026-10-06T03:00:00Z");
    const r = nextOccurrence("FREQ=DAILY", { dueDate: "2026-10-05", dueAt: "2026-10-06T02:30:00Z" }, NEW_YORK, now);
    expect(r).toEqual({ dueDate: "2026-10-06", dueAt: "2026-10-07T02:30:00.000Z" });
  });
});

describe("upcomingOccurrences", () => {
  it("lists the next dates", () => {
    expect(upcomingOccurrences("FREQ=WEEKLY;BYDAY=MO,TH", "2026-10-05", 3)).toEqual(["2026-10-05", "2026-10-08", "2026-10-12"]);
  });
});
