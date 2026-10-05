"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { diffDays, isoWeekday, parseISODate, timeIn } from "./dates";
import type { ISODate } from "./types";

type T = (key: string, values?: Record<string, string | number | Date>) => string;
type Raw = (key: string) => unknown;

/**
 * Locale number. Uzbek: thousands separated by a (no-break) space, decimal comma — "120 000 000", "1,5".
 * Browsers ship incomplete Uzbek ICU data (Chrome formats "uz" like English), so this is done by hand.
 */
export function formatNumber(v: number, locale: string, digits = 0): string {
  const uz = locale === "uz";
  const [int, frac] = Math.abs(v).toFixed(digits).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, uz ? "\u00a0" : ",");
  const sign = v < 0 && Number(Math.abs(v).toFixed(digits)) !== 0 ? "−" : "";
  return `${sign}${grouped}${frac ? (uz ? "," : ".") + frac : ""}`;
}

export function capitalize(s: string) {
  return s ? s[0].toLocaleUpperCase() + s.slice(1) : s;
}

/**
 * Locale-aware date and number helpers built on the message files (correct Uzbek month names).
 * Pure, so non-React code (store actions, toasts) formats exactly like the UI.
 */
export function createFormat(t: T, raw: Raw, locale: string, today: ISODate, tz: string) {
  const months = raw("dates.months") as string[];
  const monthsShort = raw("dates.monthsShort") as string[];
  const weekdays = raw("dates.weekdays") as string[];
  const weekdaysShort = raw("dates.weekdaysShort") as string[];

  const dayMonth = (iso: ISODate, short = true) => {
    const d = parseISODate(iso);
    const year = d.getUTCFullYear();
    const month = (short ? monthsShort : months)[d.getUTCMonth()];
    const sameYear = iso.slice(0, 4) === today.slice(0, 4);
    return sameYear ? t("dates.dayMonth", { day: d.getUTCDate(), month }) : t("dates.dayMonthYear", { day: d.getUTCDate(), month, year });
  };

  const weekday = (iso: ISODate) => capitalize(weekdays[isoWeekday(iso) - 1]);

  /** "Bugun", "Ertaga", "Kecha", weekday within the coming week, otherwise "5-okt". */
  const relativeDay = (iso: ISODate) => {
    const diff = diffDays(today, iso);
    if (diff === 0) return t("common.today");
    if (diff === 1) return t("common.tomorrow");
    if (diff === -1) return t("common.yesterday");
    if (diff > 1 && diff < 7) return weekday(iso);
    return dayMonth(iso);
  };

  /** Relative word plus the date when the word alone is ambiguous: "ertaga, 6-okt", "Payshanba, 9-okt", "14-okt". */
  const relativeWithDate = (iso: ISODate) => {
    const diff = diffDays(today, iso);
    if (diff >= -1 && diff < 7) return `${relativeDay(iso)}, ${dayMonth(iso)}`;
    return dayMonth(iso);
  };

  const longDay = (iso: ISODate) => {
    const d = parseISODate(iso);
    return t("dates.weekdayDayMonth", { weekday: weekday(iso), day: d.getUTCDate(), month: months[d.getUTCMonth()] });
  };

  /** "Dushanba · 12-okt"; today and tomorrow get a "Bugun · " / "Ertaga · " prefix. */
  const weekdayDate = (iso: ISODate) => {
    const base = `${weekday(iso)} · ${dayMonth(iso)}`;
    const diff = diffDays(today, iso);
    if (diff === 0) return `${t("common.today")} · ${base}`;
    if (diff === 1) return `${t("common.tomorrow")} · ${base}`;
    return base;
  };

  const time = (instant: string | Date) => timeIn(tz, instant);

  const ago = (instant: string) => {
    const ms = Date.now() - new Date(instant).getTime();
    const min = Math.round(ms / 60_000);
    if (min < 1) return t("time.justNow");
    if (min < 60) return t("time.minutesAgo", { count: min });
    const h = Math.round(min / 60);
    if (h < 24) return t("time.hoursAgo", { count: h });
    const d = Math.round(h / 24);
    if (d < 7) return t("time.daysAgo", { count: d });
    return dayMonth(new Date(instant).toISOString().slice(0, 10));
  };

  const duration = (minutes: number) => {
    if (minutes < 60) return t("common.minutes", { count: minutes });
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? t("common.hoursMinutes", { h, m }) : t("common.hours", { count: h });
  };

  /** Locale number: Uzbek uses a space for thousands and a comma for decimals ("120 000 000", "1,5"). */
  const num = (v: number, digits = 0) => formatNumber(v, locale, digits);

  /** Compact duration for chart axes: "45 daq", "2 soat", "1,5 soat". */
  const hoursTick = (minutes: number) =>
    minutes < 60 ? t("common.minutes", { count: Math.round(minutes) }) : t("common.hoursShort", { count: formatNumber(minutes / 60, locale, minutes % 60 ? 1 : 0) });

  return { num, hoursTick, dayMonth, weekday, relativeDay, relativeWithDate, longDay, weekdayDate, time, ago, duration, months, monthsShort, weekdays, weekdaysShort };
}

export type Format = ReturnType<typeof createFormat>;

export function useFormat(today: ISODate, tz: string): Format {
  const t = useTranslations();
  const locale = useLocale();
  return useMemo(() => createFormat((k, v) => t(k as never, v as never), (k) => t.raw(k as never), locale, today, tz), [t, locale, today, tz]);
}
