import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext: where to go after signing in", () => {
  it("keeps paths on this site, with their query and hash", () => {
    expect(safeNext("/projects")).toBe("/projects");
    expect(safeNext("/projects/abc?view=board")).toBe("/projects/abc?view=board");
    expect(safeNext("/invite/tok#x")).toBe("/invite/tok#x");
  });

  it("refuses anything a browser would send to another host", () => {
    for (const evil of ["//evil.com", "/\\evil.com", "/\\/evil.com", "\\\\evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "evil.com", "javascript:alert(1)"]) {
      expect(safeNext(evil), JSON.stringify(evil)).toBe("/");
    }
  });

  it("falls back when there is nothing", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("//evil.com", "")).toBe("");
  });
});
