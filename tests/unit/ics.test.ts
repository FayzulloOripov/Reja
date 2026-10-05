import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";

describe("ICS feed", () => {
  it("writes all-day and timed events with escaping and CRLF", () => {
    const ics = buildIcs("Reja", [
      { uid: "task-1@reja", title: "Hisobot, yakuniy; tekshirish", date: "2026-10-05" },
      { uid: "block-2@reja", title: "Deep work", start: new Date("2026-10-05T04:00:00Z"), end: new Date("2026-10-05T05:30:00Z") },
    ], new Date("2026-10-01T00:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261006");
    expect(ics).toContain("SUMMARY:Hisobot\\, yakuniy\; tekshirish");
    expect(ics).toContain("DTSTART:20261005T040000Z\r\nDTEND:20261005T053000Z");
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("folds long lines at 75 octets, counting multibyte letters", () => {
    const ics = buildIcs("Reja", [{ uid: "x", title: "Oʻzbekcha ".repeat(20), date: "2026-10-05" }]);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
