import { describe, expect, it } from "vitest";
import { createFormat, formatNumber } from "@/lib/format";
import uz from "../../messages/uz.json";

describe("formatNumber", () => {
  it("uses a space for thousands and a comma for decimals in Uzbek", () => {
    expect(formatNumber(120_000_000, "uz")).toBe("120 000 000");
    expect(formatNumber(1, "uz", 1)).toBe("1,0");
    expect(formatNumber(1.5, "uz", 1)).toBe("1,5");
    expect(formatNumber(-2500.25, "uz", 2)).toBe("−2 500,25");
  });
  it("uses English separators in English", () => {
    expect(formatNumber(1234.5, "en", 1)).toBe("1,234.5");
  });
});

describe("createFormat (Uzbek)", () => {
  const get = (key: string): unknown => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], uz);
  const t = (key: string, values?: Record<string, string | number | Date>) =>
    String(get(key)).replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? "")).replace(/\{count, plural, one \{# ([^}]*)\} other \{# ([^}]*)\}\}/, (_, one) => `${values?.count} ${one}`);
  const f = createFormat(t, get, "uz", "2026-10-05", "Asia/Tashkent");

  it("formats day headers with weekday and date", () => {
    expect(f.weekdayDate("2026-10-12")).toBe("Dushanba · 12-okt");
    expect(f.weekdayDate("2026-10-05")).toBe("Bugun · Dushanba · 5-okt");
  });
  it("formats a relative date with the date for the toast", () => {
    expect(f.relativeWithDate("2026-10-06")).toBe("Ertaga, 6-okt");
    expect(f.relativeWithDate("2026-10-20")).toBe("20-okt");
  });
});
