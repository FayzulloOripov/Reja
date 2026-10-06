// Durations typed by people: "90", "90 daq", "45m", "1.5 soat", "1,5 soat", "2h", "1 soat 30 daq",
// "1h30m", "1:30". Returns whole minutes, or null when the text is not a duration.

const HOURS = /^(soat|s|h|hr|hrs|hour|hours|час|ч)$/;
const MINUTES = /^(daqiqa|daq|d|m|min|mins|minute|minutes|мин|м)$/;

export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(",", ".");
  if (!text) return null;
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text)); // a bare number means minutes
  const parts = [...text.matchAll(/(\d+(?:\.\d+)?)\s*([a-zа-яʻ']+)/g)];
  if (parts.length === 0 || parts.map((p) => p[0]).join("").replace(/\s/g, "") !== text.replace(/\s/g, "")) return null;
  let total = 0;
  for (const [, n, unit] of parts) {
    if (HOURS.test(unit)) total += Number(n) * 60;
    else if (MINUTES.test(unit)) total += Number(n);
    else return null;
  }
  return total > 0 ? Math.round(total) : null;
}
