// Push supabase/migrations to the project in SUPABASE_DB_URL, hiding the password.
//   npm run db:push        → production (.env.local)
//   npm run db:push:test   → the separate test project (.env.test.local, refuses production)
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import { useTestProject } from "./test-env.mjs";

const TEST = process.argv.includes("--test");
if (TEST) useTestProject("db:push:test");
else config({ path: ".env.local", quiet: true });
const url = (process.env.SUPABASE_DB_URL ?? "").trim();
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("Set SUPABASE_DB_URL in .env.local (Dashboard → Connect → Session pooler).");
  process.exit(1);
}
const password = url.match(/^postgres(?:ql)?:\/\/[^:]+:(.*)@/)?.[1] ?? "";
const res = spawnSync("npx", ["--yes", "supabase", "db", "push", "--db-url", url, ...process.argv.slice(2).filter((a) => a !== "--test")], { encoding: "utf8" });
process.stdout.write((res.stdout ?? "").replaceAll(password, "***"));
process.stderr.write((res.stderr ?? "").replaceAll(password, "***"));
process.exit(res.status ?? 1);
