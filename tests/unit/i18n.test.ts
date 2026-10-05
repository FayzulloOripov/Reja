import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import uz from "../../messages/uz.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (Array.isArray(obj) || typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("message files", () => {
  it("have the same keys in Uzbek and English", () => {
    expect(keys(uz).sort()).toEqual(keys(en).sort());
  });

  it("use the Uzbek ʻ (U+02BB), not ASCII or typographic apostrophes, after o and g", () => {
    const bad = keys(uz)
      .map((k) => [k, k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], uz)] as const)
      .filter(([, v]) => typeof v === "string" && /[oOgG]['’‘`]/.test(v as string));
    expect(bad).toEqual([]);
  });
});
