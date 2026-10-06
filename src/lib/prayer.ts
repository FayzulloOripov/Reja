// Prayer-aware planning (optional, off by default): the five prayer times for the user's city,
// shown as fixed blocks on the day timeline; reminders wait until a prayer block is over.
// Times are computed with the adhan library (Muslim World League angles, Hanafi asr by default).

import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";
import type { ISODate, Profile } from "./types";

export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerKey = (typeof PRAYERS)[number];

/** Cities of Uzbekistan for the settings picker (any coordinates work). */
export const UZ_CITIES: { name: string; lat: number; lng: number }[] = [
  { name: "Toshkent", lat: 41.2995, lng: 69.2401 },
  { name: "Samarqand", lat: 39.6542, lng: 66.9597 },
  { name: "Buxoro", lat: 39.7681, lng: 64.4556 },
  { name: "Andijon", lat: 40.7821, lng: 72.3442 },
  { name: "Namangan", lat: 40.9983, lng: 71.6726 },
  { name: "Fargʻona", lat: 40.3864, lng: 71.7864 },
  { name: "Qarshi", lat: 38.8606, lng: 65.7891 },
  { name: "Termiz", lat: 37.2242, lng: 67.2783 },
  { name: "Jizzax", lat: 40.1158, lng: 67.8422 },
  { name: "Guliston", lat: 40.4897, lng: 68.7842 },
  { name: "Navoiy", lat: 40.0844, lng: 65.3792 },
  { name: "Nukus", lat: 42.4531, lng: 59.6103 },
  { name: "Urganch", lat: 41.5534, lng: 60.6317 },
  { name: "Nurafshon", lat: 41.0167, lng: 69.35 },
];

export type PrayerSettings = Pick<Profile, "prayer_enabled" | "prayer_lat" | "prayer_lng" | "prayer_madhab" | "prayer_minutes">;

export interface PrayerBlock {
  key: PrayerKey;
  start: Date;
  end: Date;
}

/** The five prayer blocks of a local date (empty when off or no location). */
export function prayerBlocks(date: ISODate, p: PrayerSettings): PrayerBlock[] {
  if (!p.prayer_enabled || p.prayer_lat == null || p.prayer_lng == null) return [];
  const [y, m, d] = date.split("-").map(Number);
  const params = CalculationMethod.MuslimWorldLeague();
  params.madhab = p.prayer_madhab === "shafi" ? Madhab.Shafi : Madhab.Hanafi;
  // adhan reads the calendar day from the Date's local fields
  const times = new PrayerTimes(new Coordinates(Number(p.prayer_lat), Number(p.prayer_lng)), new Date(y, m - 1, d), params);
  const minutes = p.prayer_minutes || 20;
  return PRAYERS.map((key) => {
    const start = times[key];
    return { key, start, end: new Date(start.getTime() + minutes * 60_000) };
  });
}

/** If `at` falls inside a prayer block, when that block ends (else null). Checks the local day and the one before (isha past midnight). */
export function prayerBlockEnd(at: Date, p: PrayerSettings, localDate: ISODate, prevDate: ISODate): Date | null {
  for (const b of [...prayerBlocks(prevDate, p), ...prayerBlocks(localDate, p)]) {
    if (at >= b.start && at < b.end) return b.end;
  }
  return null;
}
