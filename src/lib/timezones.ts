const NAMES: Record<string, { uz: string; en: string }> = {
  "Asia/Tashkent": { uz: "Toshkent", en: "Tashkent" },
  "Asia/Samarkand": { uz: "Samarqand", en: "Samarkand" },
  "Europe/Moscow": { uz: "Moskva", en: "Moscow" },
  "Europe/Istanbul": { uz: "Istanbul", en: "Istanbul" },
  "Asia/Dubai": { uz: "Dubay", en: "Dubai" },
  "Europe/London": { uz: "London", en: "London" },
  "Asia/Almaty": { uz: "Olmaota", en: "Almaty" },
  "Asia/Seoul": { uz: "Seul", en: "Seoul" },
  "America/New_York": { uz: "Nyu-York", en: "New York" },
};

/** "UTC+5" for a time zone right now ("UTC" when there is no offset). */
export function utcOffset(zone: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName");
    const off = part?.value.replace(/^GMT/, "") ?? "";
    return off ? `UTC${off}` : "UTC";
  } catch {
    return "";
  }
}

/** A person-readable time zone: "Toshkent · UTC+5" instead of "Asia/Tashkent". */
export function timezoneLabel(zone: string, locale: string): string {
  if (zone === "UTC") return "UTC";
  const known = NAMES[zone];
  const city = known ? (locale === "en" ? known.en : known.uz) : (zone.split("/").pop() ?? zone).replace(/_/g, " ");
  const off = utcOffset(zone);
  return off ? `${city} · ${off}` : city;
}
