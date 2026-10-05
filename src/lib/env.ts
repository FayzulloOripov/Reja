// Public configuration (safe for the browser). Server secrets live in src/server/env.ts.

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Reja";

/**
 * The whole deployment runs as a demo (local development and tests only): NEXT_PUBLIC_DEMO=1.
 * Otherwise the real backend is the default and the demo lives behind /demo (a cookie).
 * NEXT_PUBLIC_DEMO_MODE=true is the older name and still works.
 */
export const FORCED_DEMO = process.env.NEXT_PUBLIC_DEMO === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Set by /demo, cleared by /demo/exit. */
export const DEMO_COOKIE = "reja_demo";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Supabase now issues "publishable" keys (sb_publishable_…); older projects use the anon JWT. */
export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";

export const DEFAULT_TIMEZONE = "Asia/Tashkent";

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);
