/**
 * Seed clearly fake demo data into a Supabase project for an existing user.
 *
 *   ALLOW_DEMO_SEED=true npm run seed:demo -- --email you@example.com
 *
 * Creates a "Demo agentlik" workspace with areas, projects, tasks, habits, goals and two fake
 * teammates (partner@example.test, consultant@example.test). Refuses to run unless
 * ALLOW_DEMO_SEED=true, so production stays empty.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { seedDemoAccount } from "../src/lib/demo/seed-account";
import { normalizeSupabaseUrl } from "../src/lib/env";

config({ path: ".env.local" });
config();

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error("Refusing to seed: set ALLOW_DEMO_SEED=true (never in production).");
    process.exit(1);
  }
  const email = process.argv[process.argv.indexOf("--email") + 1];
  if (!email || email.startsWith("--")) {
    console.error("Usage: npm run seed:demo -- --email you@example.com");
    process.exit(1);
  }
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: me } = await sb.from("profiles").select("id, language, timezone").eq("email", email).single();
  if (!me) throw new Error(`No user with email ${email}. Sign in to the app once first.`);

  const teammate = async (mail: string, name: string) => {
    const { data: existing } = await sb.from("profiles").select("id").eq("email", mail).maybeSingle();
    if (existing) return existing.id as string;
    const { data, error } = await sb.auth.admin.createUser({ email: mail, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    return data.user.id;
  };
  const lang = me.language === "en" ? "en" : "uz";
  const partner = await teammate("partner@example.test", lang === "en" ? "Partner (demo)" : "Hamkor (demo)");
  const guest = await teammate("consultant@example.test", lang === "en" ? "Consultant (demo)" : "Konsultant (demo)");
  const res = await seedDemoAccount(sb, { me: me.id, partner, guest }, { lang, tz: me.timezone });
  console.log(`Seeded demo data for ${email}: ${res.projects} projects, ${res.tasks} tasks.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
