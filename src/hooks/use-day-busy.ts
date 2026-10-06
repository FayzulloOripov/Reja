"use client";

import { useMemo } from "react";
import { dateIn, minutesOfDay } from "@/lib/dates";
import type { Span } from "@/lib/energy";
import { prayerBlocks, type PrayerKey } from "@/lib/prayer";
import { useMe, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

export interface FixedItem {
  id: string;
  kind: "prayer" | "event";
  start: number;
  end: number;
  title: string;
  prayer?: PrayerKey;
}

/** Fixed time on a day: prayer blocks (when on) and busy events from Google Calendar. */
export function useFixedItems(date: string): { fixed: FixedItem[]; allDay: { id: string; title: string }[] } {
  const me = useMe();
  const tz = useTz();
  const uid = useUserId();
  const events = useStore((s) => s.data.calendar_events);
  return useMemo(() => {
    const fixed: FixedItem[] = [];
    const allDay: { id: string; title: string }[] = [];
    if (me) {
      for (const b of prayerBlocks(date, me)) {
        fixed.push({ id: `prayer-${b.key}`, kind: "prayer", prayer: b.key, start: minutesOfDay(tz, b.start), end: minutesOfDay(tz, b.end) || 24 * 60, title: b.key });
      }
    }
    for (const e of Object.values(events)) {
      if (e.user_id !== uid || e.time_block_id) continue;
      if (e.all_day) {
        if (e.start_at.slice(0, 10) <= date && e.end_at.slice(0, 10) > date) allDay.push({ id: e.id, title: e.title ?? "" });
        continue;
      }
      const startDay = dateIn(tz, e.start_at);
      const endDay = dateIn(tz, e.end_at);
      if (startDay > date || endDay < date) continue;
      const start = startDay < date ? 0 : minutesOfDay(tz, e.start_at);
      const end = endDay > date ? 24 * 60 : minutesOfDay(tz, e.end_at);
      if (end <= start) continue;
      fixed.push({ id: `event-${e.id}`, kind: "event", start, end, title: e.title ?? "" });
    }
    return { fixed: fixed.sort((a, b) => a.start - b.start), allDay };
  }, [me, tz, uid, events, date]);
}

/** Everything that takes time on a day: time blocks, timed tasks, prayers and calendar events. */
export function useBusySpans(date: string): Span[] {
  const tz = useTz();
  const uid = useUserId();
  const blocks = useStore((s) => s.data.time_blocks);
  const { fixed } = useFixedItems(date);
  return useMemo(() => {
    const out: Span[] = fixed.map((f) => ({ start: f.start, end: f.end }));
    for (const b of Object.values(blocks)) {
      if (b.user_id !== uid || b.date !== date) continue;
      out.push({ start: minutesOfDay(tz, b.start_at), end: minutesOfDay(tz, b.end_at) || 24 * 60 });
    }
    return out;
  }, [fixed, blocks, uid, date, tz]);
}

