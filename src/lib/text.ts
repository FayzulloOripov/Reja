// Uzbek text helpers. Users type the oʻ/gʻ apostrophe in many ways: ' ’ ‘ ` ʻ ʼ.
// For matching and search we fold them all into one character.

const APOSTROPHES = /['’‘`ʻʼ´]/g;

/** Lowercase, unify apostrophes and strip diacritics — for search and fuzzy matching only. */
export function fold(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(APOSTROPHES, "'")
    .toLowerCase()
    .trim();
}

/** True when every word of `query` appears (as a prefix or substring) in `text`. */
export function matches(text: string, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const t = fold(text);
  return q.split(/\s+/).every((part) => t.includes(part));
}

/** Score a match for ranking: exact > prefix > word-prefix > substring. 0 = no match. */
export function matchScore(text: string, query: string): number {
  const q = fold(query);
  const t = fold(text);
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s\-_/#]+/).some((w) => w.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  return matches(text, query) ? 20 : 0;
}

/** Convert typed o' / g' to the proper Uzbek letters oʻ / gʻ (U+02BB) for display of app strings. */
export function uzApostrophe(input: string): string {
  return input.replace(/([oOgG])['’‘`ʼ]/g, "$1ʻ");
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
