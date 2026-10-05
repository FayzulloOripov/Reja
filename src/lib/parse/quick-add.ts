// Natural-language quick add for Uzbek (Latin) and English.
//
//   "Hisobotni yuborish ertaga 10:00 #Topcoach !1 *"
//   → title "Hisobotni yuborish", due tomorrow 10:00, project Topcoach, urgent, top 3
//
// The parser is pure: pass `today` (in the user's time zone) and the candidate projects/people.

import { addDays, addMonths, isoWeekday, nextWeekday, parseISODate, toISODate } from "@/lib/dates";
import type { ISODate, TaskPriority } from "@/lib/types";

export type ChipKind = "date" | "time" | "repeat" | "project" | "person" | "priority" | "top";

export interface Chip {
  kind: ChipKind;
  start: number;
  end: number;
  text: string;
  /** machine value: ISO date, HH:mm, RRULE, id, priority */
  value: string;
}

export interface ParseContext {
  today: ISODate;
  /** minutes since local midnight, used to decide whether a bare time means today or tomorrow */
  nowMinutes?: number;
  projects?: { id: string; name: string }[];
  people?: { id: string; name: string }[];
  /** ISO weekdays that count as work days (default Mon–Sat) */
  workDays?: number[];
}

export interface ParseResult {
  title: string;
  dueDate: ISODate | null;
  dueTime: string | null;
  recurrence: string | null;
  projectId: string | null;
  unknownProject: string | null;
  assigneeIds: string[];
  priority: TaskPriority | null;
  top: boolean;
  chips: Chip[];
}

// ------------------------------------------------------------------ vocabulary

const WEEKDAYS: Record<string, number> = {
  dushanba: 1, seshanba: 2, chorshanba: 3, payshanba: 4, juma: 5, shanba: 6, yakshanba: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
  mon: 1, tue: 2, tues: 2, thu: 4, thur: 4, thurs: 4, fri: 5,
};
const RRULE_DAY = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const MONTHS: Record<string, number> = {
  yanvar: 1, fevral: 2, mart: 3, aprel: 4, may: 5, iyun: 6, iyul: 7, avgust: 8,
  sentabr: 9, sentyabr: 9, oktabr: 10, oktyabr: 10, noyabr: 11, dekabr: 12,
  yan: 1, fev: 2, apr: 4, iyn: 6, iyl: 7, avg: 8, sen: 9, okt: 10, noy: 11, dek: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const WD = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join("|");
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

// word boundaries that understand Unicode letters
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";

// Uzbek case suffixes that can follow a date word: "ertagacha", "dushanbaga", "juma kuni"
const SUF = "(?:\\s?kuni|gacha|ga|da)?";

interface Candidate {
  kind: ChipKind;
  start: number;
  end: number;
  value: string;
  extra?: { time?: string };
}

/** Lowercase and unify apostrophes without changing string length (keeps indices aligned). */
function normalise(s: string): string {
  let out = "";
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const c = lower.length === ch.length ? lower : ch;
    out += /['’‘`ʻʼ´]/.test(c) ? "'" : c;
  }
  return out;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function validDate(y: number, m: number, d: number): ISODate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return toISODate(date);
}

/** Day + month without a year: this year, or next year if the date has passed. */
function dayMonth(today: ISODate, d: number, m: number): ISODate | null {
  const y = parseISODate(today).getUTCFullYear();
  const thisYear = validDate(y, m, d);
  if (!thisYear) return null;
  return thisYear < today ? validDate(y + 1, m, d) : thisYear;
}

function to24(h: number, m: number, mer?: string | null, part?: string | null): string | null {
  let hour = h;
  if (mer) {
    const pm = mer.startsWith("p");
    if (hour < 1 || hour > 12) return null;
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  } else if (part) {
    // "kechqurun 7" → 19:00, "tushdan keyin 3" → 15:00
    if (/kech|evening|tonight|tushdan|afternoon|kunduz/.test(part) && hour < 12) hour += 12;
  }
  if (hour > 23 || m > 59) return null;
  return `${pad(hour)}:${pad(m)}`;
}

// ------------------------------------------------------------------ rules

type Rule = (text: string, ctx: Required<Pick<ParseContext, "today" | "workDays">> & ParseContext) => Candidate[];

function all(re: RegExp, text: string, fn: (m: RegExpExecArray) => Omit<Candidate, "start" | "end"> | null): Candidate[] {
  const out: Candidate[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    const c = fn(m);
    if (c) out.push({ ...c, start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) g.lastIndex++;
  }
  return out;
}

const rules: Rule[] = [
  // ---- recurrence
  (t, ctx) =>
    all(new RegExp(`${B}(?:har\\s+(\\d+)\\s+(kun|hafta|oy|yil)(?:da|dan)?|every\\s+(\\d+)\\s+(days?|weeks?|months?|years?))${E}`, "u"), t, (m) => {
      const n = Number(m[1] ?? m[3]);
      const unit = (m[2] ?? m[4]).replace(/s$/, "");
      const freq = { kun: "DAILY", day: "DAILY", hafta: "WEEKLY", week: "WEEKLY", oy: "MONTHLY", month: "MONTHLY", yil: "YEARLY", year: "YEARLY" }[unit];
      if (!freq || n < 1) return null;
      void ctx;
      return { kind: "repeat", value: `FREQ=${freq};INTERVAL=${n}` };
    }),
  (t, ctx) =>
    all(new RegExp(`${B}(har\\s+kuni|har\\s+kun|every\\s+day|daily|har\\s+hafta|every\\s+week|weekly|har\\s+oy|every\\s+month|monthly|har\\s+yili?|every\\s+year|yearly|annually|har\\s+ish\\s+kuni|ish\\s+kunlari|every\\s+weekday|weekdays)${E}`, "u"), t, (m) => {
      const w = m[1].replace(/\s+/g, " ");
      if (/kun$|kuni$|day$|daily/.test(w) && !/ish/.test(w) && !/weekday/.test(w)) return { kind: "repeat", value: "FREQ=DAILY" };
      if (/hafta|week(?!day)|weekly/.test(w) && !/weekday/.test(w)) return { kind: "repeat", value: "FREQ=WEEKLY" };
      if (/oy|month/.test(w)) return { kind: "repeat", value: "FREQ=MONTHLY" };
      if (/yil|year|annual/.test(w)) return { kind: "repeat", value: "FREQ=YEARLY" };
      const days = ctx.workDays.map((d) => RRULE_DAY[d]).join(",");
      return { kind: "repeat", value: `FREQ=WEEKLY;BYDAY=${days}` };
    }),
  (t) =>
    all(new RegExp(`${B}(?:har|every)\\s+(${WD})${SUF}${E}`, "u"), t, (m) => ({
      kind: "repeat",
      value: `FREQ=WEEKLY;BYDAY=${RRULE_DAY[WEEKDAYS[m[1]]]}`,
    })),

  // ---- relative dates
  (t, ctx) =>
    all(new RegExp(`${B}(bugun|today|tonight|ertaga|tomorrow|tmrw?|indinga|day after tomorrow)${SUF}${E}`, "u"), t, (m) => {
      const w = m[1];
      const n = /bugun|today|tonight/.test(w) ? 0 : /ertaga|tomorrow|tmr/.test(w) ? 1 : 2;
      return { kind: "date", value: addDays(ctx.today, n), extra: w === "tonight" ? { time: "20:00" } : undefined };
    }),
  (t, ctx) =>
    all(new RegExp(`${B}(?:(keyingi|kelasi|next)\\s+)?(${WD})${SUF}${E}`, "u"), t, (m) => {
      const dow = WEEKDAYS[m[2]];
      let d = nextWeekday(ctx.today, dow, false);
      if (m[1]) {
        // "keyingi dushanba" = the weekday in next week's Monday-based week
        const nextMonday = nextWeekday(ctx.today, 1, false);
        d = addDays(nextMonday, dow - 1);
      }
      return { kind: "date", value: d };
    }),
  (t, ctx) =>
    all(new RegExp(`${B}(keyingi\\s+hafta(?:ga|da)?|kelasi\\s+hafta(?:ga|da)?|next\\s+week|keyingi\\s+oy(?:ga|da)?|kelasi\\s+oy(?:ga|da)?|next\\s+month)${E}`, "u"), t, (m) => {
      if (/oy|month/.test(m[1])) return { kind: "date", value: addMonths(`${ctx.today.slice(0, 7)}-01`, 1) };
      return { kind: "date", value: nextWeekday(ctx.today, 1, false) };
    }),
  (t, ctx) =>
    all(new RegExp(`${B}(?:(\\d{1,3})\\s+(kun|hafta|oy)(?:dan)?\\s+(?:keyin|so'ng)|in\\s+(\\d{1,3})\\s+(days?|weeks?|months?))${E}`, "u"), t, (m) => {
      const n = Number(m[1] ?? m[3]);
      const unit = m[2] ?? m[4];
      if (/oy|month/.test(unit)) return { kind: "date", value: addMonths(ctx.today, n) };
      const days = /hafta|week/.test(unit) ? n * 7 : n;
      return { kind: "date", value: addDays(ctx.today, days) };
    }),

  // ---- absolute dates
  (t) =>
    all(new RegExp(`${B}(\\d{4})-(\\d{2})-(\\d{2})${E}`, "u"), t, (m) => {
      const d = validDate(Number(m[1]), Number(m[2]), Number(m[3]));
      return d ? { kind: "date", value: d } : null;
    }),
  (t, ctx) =>
    all(new RegExp(`${B}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?${E}`, "u"), t, (m) => {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      if (m[3]) {
        const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
        const v = validDate(y, mo, d);
        return v ? { kind: "date", value: v } : null;
      }
      const v = dayMonth(ctx.today, d, mo);
      return v ? { kind: "date", value: v } : null;
    }),
  (t, ctx) =>
    all(new RegExp(`${B}(\\d{1,2})(?:-|\\s|st\\s|nd\\s|rd\\s|th\\s)(${MON})${SUF}${E}`, "u"), t, (m) => {
      const v = dayMonth(ctx.today, Number(m[1]), MONTHS[m[2]]);
      return v ? { kind: "date", value: v } : null;
    }),
  (t, ctx) =>
    all(new RegExp(`${B}(${MON})\\s+(\\d{1,2})(?:st|nd|rd|th)?${E}`, "u"), t, (m) => {
      const v = dayMonth(ctx.today, Number(m[2]), MONTHS[m[1]]);
      return v ? { kind: "date", value: v } : null;
    }),

  // ---- times: "10:00", "5pm", "soat 10 da", "kechqurun 7", "at 17:30"
  (t) =>
    all(
      new RegExp(
        `${B}(soat\\s+|at\\s+)?(?:(ertalab|kechqurun|kechki|tushdan\\s+keyin|kunduzi|morning|evening|afternoon|tonight)\\s+(?:soat\\s+|at\\s+)?)?(\\d{1,2})(?::(\\d{2}))?\\s?(am|pm)?(\\s?(?:da|gacha))?${E}`,
        "u",
      ),
      t,
      (m) => {
        const [, prefix, part, hour, minute, mer, suffix] = m;
        // bare numbers ("3 ta", "2026") are not times
        if (!prefix && !part && minute === undefined && !mer && !suffix) return null;
        const v = to24(Number(hour), Number(minute ?? 0), mer ?? null, part ?? null);
        return v ? { kind: "time", value: v } : null;
      },
    ),
  (t) =>
    all(new RegExp(`${B}(ertalab|tushda|peshinda|kechqurun|morning|noon|midday|evening)${E}`, "u"), t, (m) => {
      const v = { ertalab: "09:00", morning: "09:00", tushda: "13:00", peshinda: "13:00", noon: "12:00", midday: "12:00", kechqurun: "19:00", evening: "19:00" }[m[1]];
      return v ? { kind: "time", value: v } : null;
    }),

  // ---- priority and top 3
  (t) =>
    all(/(?<![\p{L}\p{N}!])!([1-4])(?![\p{N}])/u, t, (m) => ({
      kind: "priority",
      value: (["urgent", "high", "medium", "low"] as const)[Number(m[1]) - 1],
    })),
  (t) => all(/(?<=^|\s)\*(?=\s|$)/u, t, () => ({ kind: "top", value: "1" })),
];

/** Match "#name" / "@name" against known names, preferring the longest. */
function mentionCandidates(
  text: string,
  original: string,
  sigil: "#" | "@",
  kind: "project" | "person",
  items: { id: string; name: string }[],
): Candidate[] {
  const out: Candidate[] = [];
  const sorted = items
    .map((i) => ({ ...i, key: normalise(i.name) }))
    .sort((a, b) => b.key.length - a.key.length);
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== sigil) continue;
    if (i > 0 && /[\p{L}\p{N}]/u.test(text[i - 1])) continue; // e-mail addresses, "C#"
    const rest = text.slice(i + 1);
    let found: (typeof sorted)[number] | undefined;
    for (const item of sorted) {
      const firstWord = item.key.split(/\s+/)[0];
      if (rest.startsWith(item.key) && !/[\p{L}\p{N}]/u.test(rest[item.key.length] ?? "")) {
        found = item;
        out.push({ kind, start: i, end: i + 1 + item.key.length, value: item.id });
        break;
      }
      if (kind === "person" && rest.startsWith(firstWord) && !/[\p{L}\p{N}]/u.test(rest[firstWord.length] ?? "")) {
        found = item;
        out.push({ kind, start: i, end: i + 1 + firstWord.length, value: item.id });
        break;
      }
    }
    if (!found) {
      const m = /^[\p{L}\p{N}_'.-]+/u.exec(original.slice(i + 1));
      if (m) {
        // "#Agency" → "Agency clients": a unique project whose name starts with the typed word
        const word = normalise(m[0]);
        const prefixed = sorted.filter((item) => item.key.startsWith(word) || item.key.split(/\s+/).some((w) => w.startsWith(word) && word.length >= 3));
        if (prefixed.length === 1) out.push({ kind, start: i, end: i + 1 + m[0].length, value: prefixed[0].id });
        else out.push({ kind, start: i, end: i + 1 + m[0].length, value: `?${m[0]}` });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ main

export function parseQuickAdd(input: string, context: ParseContext): ParseResult {
  const ctx = { workDays: [1, 2, 3, 4, 5, 6], ...context };
  const text = normalise(input);

  let candidates: Candidate[] = [];
  for (const rule of rules) candidates.push(...rule(text, ctx));
  candidates.push(...mentionCandidates(text, input, "#", "project", ctx.projects ?? []));
  candidates.push(...mentionCandidates(text, input, "@", "person", ctx.people ?? []));

  // longest first, then leftmost; drop overlaps
  candidates = candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const accepted: Candidate[] = [];
  const singleKinds = new Set<ChipKind>(["date", "time", "repeat", "project", "priority", "top"]);
  for (const c of candidates) {
    if (accepted.some((a) => c.start < a.end && a.start < c.end)) continue;
    if (singleKinds.has(c.kind) && accepted.some((a) => a.kind === c.kind)) continue;
    accepted.push(c);
  }
  accepted.sort((a, b) => a.start - b.start);

  const result: ParseResult = {
    title: "",
    dueDate: null,
    dueTime: null,
    recurrence: null,
    projectId: null,
    unknownProject: null,
    assigneeIds: [],
    priority: null,
    top: false,
    chips: [],
  };

  for (const c of accepted) {
    const chip: Chip = { kind: c.kind, start: c.start, end: c.end, text: input.slice(c.start, c.end), value: c.value };
    switch (c.kind) {
      case "date":
        result.dueDate = c.value;
        if (c.extra?.time && !result.dueTime) result.dueTime = c.extra.time;
        break;
      case "time":
        result.dueTime = c.value;
        break;
      case "repeat":
        result.recurrence = c.value;
        break;
      case "project":
        if (c.value.startsWith("?")) result.unknownProject = c.value.slice(1);
        else result.projectId = c.value;
        break;
      case "person":
        if (!c.value.startsWith("?") && !result.assigneeIds.includes(c.value)) result.assigneeIds.push(c.value);
        break;
      case "priority":
        result.priority = c.value as TaskPriority;
        break;
      case "top":
        result.top = true;
        break;
    }
    result.chips.push(chip);
  }

  const timePassed =
    result.dueTime !== null &&
    ctx.nowMinutes !== undefined &&
    Number(result.dueTime.slice(0, 2)) * 60 + Number(result.dueTime.slice(3)) <= ctx.nowMinutes;

  // A recurrence needs a first occurrence (skipping today when its time has passed).
  if (result.recurrence && !result.dueDate) {
    const start = timePassed ? addDays(ctx.today, 1) : ctx.today;
    const byday = /BYDAY=([A-Z,]+)/.exec(result.recurrence)?.[1];
    if (byday) {
      const days = byday.split(",").map((d) => RRULE_DAY.indexOf(d));
      let d = start;
      for (let i = 0; i < 7 && !days.includes(isoWeekday(d)); i++) d = addDays(d, 1);
      result.dueDate = d;
    } else {
      result.dueDate = start;
    }
  }
  // "har hafta" with a weekday date → weekly on that weekday
  if (result.recurrence === "FREQ=WEEKLY" && result.dueDate) {
    result.recurrence = `FREQ=WEEKLY;BYDAY=${RRULE_DAY[isoWeekday(result.dueDate)]}`;
  }
  // A bare time: today if still ahead, otherwise tomorrow.
  if (result.dueTime && !result.dueDate) {
    result.dueDate = timePassed ? addDays(ctx.today, 1) : ctx.today;
  }

  // Title = input minus accepted spans (unknown #project text stays out of the title too).
  let title = "";
  let cursor = 0;
  for (const c of accepted) {
    if (c.kind === "person" && c.value.startsWith("?")) continue; // keep unknown @word in title
    title += input.slice(cursor, c.start);
    cursor = c.end;
  }
  title += input.slice(cursor);
  result.title = title
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
    .trim();

  return result;
}

/** Human-readable RRULE for chips (uz/en handled by caller via i18n keys). */
export function describeRecurrence(rrule: string): { key: string; interval: number; days: number[] } {
  const freq = /FREQ=(\w+)/.exec(rrule)?.[1] ?? "DAILY";
  const interval = Number(/INTERVAL=(\d+)/.exec(rrule)?.[1] ?? 1);
  const days = (/BYDAY=([A-Z,]+)/.exec(rrule)?.[1] ?? "")
    .split(",")
    .filter(Boolean)
    .map((d) => RRULE_DAY.indexOf(d));
  return { key: freq.toLowerCase(), interval, days };
}
