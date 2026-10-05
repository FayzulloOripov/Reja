// Focus statistics. Home and the focus page both read finished focus sessions from time entries
// (source = "focus"), so their numbers always agree.

import { dateIn } from "./dates";
import type { ISODate, TimeEntry } from "./types";

export interface FocusSummary {
  minutes: number;
  sessions: number;
}

export function focusSummary(entries: Pick<TimeEntry, "user_id" | "source" | "started_at" | "minutes">[], userId: string, tz: string, from: ISODate, to: ISODate): FocusSummary {
  let minutes = 0;
  let sessions = 0;
  for (const e of entries) {
    if (e.user_id !== userId || e.source !== "focus") continue;
    const d = dateIn(tz, e.started_at);
    if (d < from || d > to) continue;
    minutes += e.minutes;
    sessions += 1;
  }
  return { minutes, sessions };
}
