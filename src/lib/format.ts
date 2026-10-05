"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { diffDays, isoWeekday, parseISODate, timeIn } from "./dates";
import type { ISODate } from "./types";

/** Locale-aware date helpers built on the message files (correct Uzbek month names). */
export function useFormat(today: ISODate, tz: string) {
  const t = useTranslations();
  const months = useMemo(() => t.raw("dates.months") as string[], [t]);
  const monthsShort = useMemo(() => t.raw("dates.monthsShort") as string[], [t]);
  const weekdays = useMemo(() => t.raw("dates.weekdays") as string[], [t]);
  const weekdaysShort = useMemo(() => t.raw("dates.weekdaysShort") as string[], [t]);

  const dayMonth = useCallback(
    (iso: ISODate, short = true) => {
      const d = parseISODate(iso);
      const year = d.getUTCFullYear();
      const month = (short ? monthsShort : months)[d.getUTCMonth()];
      const sameYear = iso.slice(0, 4) === today.slice(0, 4);
      return sameYear
        ? t("dates.dayMonth", { day: d.getUTCDate(), month })
        : t("dates.dayMonthYear", { day: d.getUTCDate(), month, year });
    },
    [months, monthsShort, t, today],
  );

  /** "Bugun", "Ertaga", "Kecha", weekday within the coming week, otherwise "5-okt". */
  const relativeDay = useCallback(
    (iso: ISODate) => {
      const diff = diffDays(today, iso);
      if (diff === 0) return t("common.today");
      if (diff === 1) return t("common.tomorrow");
      if (diff === -1) return t("common.yesterday");
      if (diff > 1 && diff < 7) return capitalize(weekdays[isoWeekday(iso) - 1]);
      return dayMonth(iso);
    },
    [dayMonth, t, today, weekdays],
  );

  const longDay = useCallback(
    (iso: ISODate) => {
      const d = parseISODate(iso);
      return t("dates.weekdayDayMonth", {
        weekday: capitalize(weekdays[isoWeekday(iso) - 1]),
        day: d.getUTCDate(),
        month: months[d.getUTCMonth()],
      });
    },
    [months, t, weekdays],
  );

  const time = useCallback((instant: string | Date) => timeIn(tz, instant), [tz]);

  const ago = useCallback(
    (instant: string) => {
      const ms = Date.now() - new Date(instant).getTime();
      const min = Math.round(ms / 60_000);
      if (min < 1) return t("time.justNow");
      if (min < 60) return t("time.minutesAgo", { count: min });
      const h = Math.round(min / 60);
      if (h < 24) return t("time.hoursAgo", { count: h });
      const d = Math.round(h / 24);
      if (d < 7) return t("time.daysAgo", { count: d });
      return dayMonth(new Date(instant).toISOString().slice(0, 10));
    },
    [dayMonth, t],
  );

  const duration = useCallback(
    (minutes: number) => {
      if (minutes < 60) return t("common.minutes", { count: minutes });
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m ? t("common.hoursMinutes", { h, m }) : t("common.hours", { count: h });
    },
    [t],
  );

  return { dayMonth, relativeDay, longDay, time, ago, duration, months, monthsShort, weekdays, weekdaysShort };
}

export function capitalize(s: string) {
  return s ? s[0].toLocaleUpperCase() + s.slice(1) : s;
}
