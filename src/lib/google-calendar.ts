// Google Calendar ↔ Reja mapping. Pure functions (the network part lives in server/google.ts).
//   • events are read with singleEvents=true, so a recurring event arrives as one row per occurrence;
//   • events marked "free" (transparency: transparent) and cancelled ones are not busy time;
//   • all-day events keep their calendar dates (end date is exclusive, as Google sends it);
//   • a time block mirrored to Google carries its id in extendedProperties.private.rejaBlock.

import type { TimeBlock } from "./types";

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export interface CalendarEventRow {
  google_id: string;
  calendar_id: string;
  title: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  time_block_id: string | null;
}

/** A busy row for our table, or null when the event takes no time. */
export function mapGoogleEvent(ev: GoogleEvent, calendarId: string): CalendarEventRow | null {
  if (ev.status === "cancelled" || ev.transparency === "transparent") return null;
  const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
  const start = allDay ? `${ev.start!.date}T00:00:00.000Z` : ev.start?.dateTime ? new Date(ev.start.dateTime).toISOString() : null;
  const end = allDay ? `${ev.end?.date ?? ev.start!.date}T00:00:00.000Z` : ev.end?.dateTime ? new Date(ev.end.dateTime).toISOString() : null;
  if (!start || !end) return null;
  return {
    google_id: ev.id,
    calendar_id: calendarId,
    title: ev.summary?.trim() || null,
    start_at: start,
    end_at: end,
    all_day: allDay,
    time_block_id: ev.extendedProperties?.private?.rejaBlock ?? null,
  };
}

/** The Google event body for one of our time blocks. */
export function blockToGoogleEvent(block: Pick<TimeBlock, "id" | "start_at" | "end_at">, title: string, tz: string) {
  return {
    summary: title,
    start: { dateTime: new Date(block.start_at).toISOString(), timeZone: tz },
    end: { dateTime: new Date(block.end_at).toISOString(), timeZone: tz },
    extendedProperties: { private: { rejaBlock: block.id } },
    reminders: { useDefault: false },
  };
}

export interface PushPlan {
  create: string[];
  update: string[];
  /** Google event ids to delete (block gone, or no longer synced) */
  remove: string[];
  /** blocks whose stored event id must be cleared */
  clear: string[];
}

/**
 * What to change in Google so it mirrors our synced blocks.
 * `mirrored` are the Google events that carry a rejaBlock id (read during the pull).
 */
export function planBlockPush(
  blocks: Pick<TimeBlock, "id" | "sync_google" | "google_event_id" | "updated_at">[],
  mirrored: { google_id: string; time_block_id: string | null }[],
  lastSyncedAt: string | null,
): PushPlan {
  const plan: PushPlan = { create: [], update: [], remove: [], clear: [] };
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (const b of blocks) {
    if (b.sync_google && !b.google_event_id) plan.create.push(b.id);
    else if (b.sync_google && b.google_event_id && (!lastSyncedAt || b.updated_at > lastSyncedAt)) plan.update.push(b.id);
    else if (!b.sync_google && b.google_event_id) {
      plan.remove.push(b.google_event_id);
      plan.clear.push(b.id);
    }
  }
  for (const m of mirrored) {
    if (m.time_block_id && !byId.has(m.time_block_id)) plan.remove.push(m.google_id);
  }
  return plan;
}

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
/** How far the pull reaches: a week back, two months ahead. */
export const SYNC_PAST_DAYS = 7;
export const SYNC_FUTURE_DAYS = 60;
