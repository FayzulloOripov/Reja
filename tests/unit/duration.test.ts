import { describe, expect, it } from "vitest";
import { parseDuration } from "@/lib/parse/duration";

describe("parseDuration", () => {
  it.each([
    ["90", 90],
    ["90 daq", 90],
    ["45m", 45],
    ["1.5 soat", 90],
    ["1,5 soat", 90],
    ["2h", 120],
    ["1 soat 30 daq", 90],
    ["1h30m", 90],
    ["1:30", 90],
    ["2 hours", 120],
  ])("%s → %i minutes", (text, minutes) => {
    expect(parseDuration(text)).toBe(minutes);
  });
  it.each(["", "soat", "abc", "1 kun", "-5"])("rejects %j", (text) => {
    expect(parseDuration(text)).toBeNull();
  });
});
