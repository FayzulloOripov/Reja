export const PROJECT_COLORS = [
  "tomato",
  "tangerine",
  "amber",
  "lime",
  "emerald",
  "teal",
  "sky",
  "indigo",
  "violet",
  "rose",
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];

export function isProjectColor(c: string | null | undefined): c is ProjectColor {
  return !!c && (PROJECT_COLORS as readonly string[]).includes(c);
}

export function safeColor(c: string | null | undefined): ProjectColor {
  return isProjectColor(c) ? c : "sky";
}

/** Deterministic colour for a string (people avatars, imported areas). */
export function colorFor(seed: string): ProjectColor {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
}

/** CSS var reference for inline styles (charts, SVG). */
export function colorVar(c: string | null | undefined, variant: "" | "soft" | "fg" = ""): string {
  return `var(--pc-${safeColor(c)}${variant ? `-${variant}` : ""})`;
}
