# Reja

A work and project hub for one busy person running several projects at once, shared with a partner and guests. Uzbek-first (English toggle), reminders on Telegram, installable PWA, free-tier deployable on Vercel + Supabase.

- **Bugun (Home):** top 3, today by project, overdue, next 7 days, day timeline with drag-to-block time, habits, weekly stats, plan-tomorrow flow
- **Projects:** List, Board, Calendar, Timeline (Gantt with dependencies), Table, Overview, Notes; templates; health (manual or suggested)
- **Tasks:** side panel / mobile sheet, subtasks, checklist, dependencies, labels, assignees, watchers, attachments, comments with @mentions and reactions, activity history, recurrence, reminders, time tracking
- **Quick add** (`Q`) with Uzbek + English parsing: `Hisobot ertaga 10:00 #Topcoach !1 *`
- **Sharing:** workspaces with roles, project-only guests, viewers, invite by email or link, public read-only links (off by default), realtime + presence
- **Telegram bot:** account linking, `/bugun` `/ertaga` `/hafta` `/yangi` `/inbox`, forward any message → inbox task, reminder buttons (Bajarildi / 1 soatga / Ertaga / Ochish), project → group posts
- **Reminders:** per task and standalone, quiet hours, daily digest, weekly review, overdue nudge, Web Push, email
- **Insight:** goals with key results, habits with streaks and heatmap, focus timer, reports, workload
- **Data:** soft delete with 30-day trash and undo, JSON + CSV export, CSV + planner-JSON import, ICS calendar feed, offline reading and offline quick add

Architecture, schema and RLS design: [PLAN.md](PLAN.md).

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 + shadcn/ui (Radix) · Motion · dnd-kit · Recharts · cmdk · TipTap · zustand · Supabase (Postgres + RLS, Auth, Storage, Realtime, pg_cron, pg_net) · next-intl · grammY · web-push · Resend + React Email · Zod · Vitest · PGlite · Playwright.

## Run locally

```bash
npm install
```

Without Supabase, the full UI runs on clearly fake demo data stored in your browser (server features are off):

```bash
echo "NEXT_PUBLIC_DEMO_MODE=true" > .env.local
```

```bash
npm run dev
```

With a Supabase project: copy `.env.example` to `.env.local`, fill it in (see below), push the migrations, then `npm run dev`. To fill a project with demo data for your own account (never in production):

```bash
ALLOW_DEMO_SEED=true npm run seed:demo -- --email you@example.com
```

## 1. Environment variables

| Variable | Where it comes from | Used by |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | Optional, defaults to `Reja` | UI, manifest |
| `NEXT_PUBLIC_SITE_URL` | Your production URL, e.g. `https://reja.vercel.app` | links in emails, Telegram, invites |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL | browser + server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key (`sb_publishable_…`). Older projects: `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works | browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys → `service_role` / Secret key (`sb_secret_…`, can be set as `SUPABASE_SECRET_KEY`). **Server only, never prefix with NEXT_PUBLIC** | scheduler, bot, ICS, share pages |
| `CRON_SECRET` | Any long random string: `openssl rand -hex 32` | `/api/cron/reminders` auth |
| `TELEGRAM_BOT_TOKEN` | Telegram → @BotFather → `/newbot` | bot + reminders |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | The bot's username without `@` | "Open bot" deep links |
| `TELEGRAM_WEBHOOK_SECRET` | Any random string (A–Z, a–z, 0–9, `_`, `-`) | webhook verification |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` (already generated into your local `.env.local`) | Web Push |
| `VAPID_SUBJECT` | `mailto:you@yourdomain` | Web Push |
| `RESEND_API_KEY` | resend.com → API Keys | emails (invites, digest) |
| `EMAIL_FROM` | `Reja <reja@yourdomain.uz>` on your verified domain | emails |
| `NEXT_PUBLIC_DEMO_MODE` | `false` in production | local demo only |
| `ALLOW_DEMO_SEED` | `false` in production | `npm run seed:demo` guard |

## 2. Deploy step by step

### Supabase

1. Create a project at [supabase.com](https://supabase.com) (region close to Tashkent, e.g. Frankfurt or Singapore). Save the database password.
2. Push the schema from this repo:
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref <your-project-ref>
   ```
   ```bash
   npx supabase db push
   ```
   This creates the tables, RLS policies, triggers, the private `attachments` storage bucket with its policies, the Realtime publication, and enables `pg_cron` and `pg_net`.
3. **Reminder job.** In SQL Editor run (once, after the Vercel deploy exists):
   ```sql
   select public.setup_reminder_cron('https://<your-app>.vercel.app/api/cron/reminders', '<CRON_SECRET>');
   ```
   It stores the secret in Vault and schedules `reja-reminders` every minute plus a daily `reja-purge` (trash older than 30 days, activity older than 12 months). Check with `select * from cron.job;` and `select * from cron.job_run_details order by start_time desc limit 5;`.
4. **Auth → URL Configuration:** Site URL = your production URL; Redirect URLs = `https://<app>/auth/callback`, `https://<app>/auth/confirm` (plus `http://localhost:3000/**` for development).
5. **Auth → Email templates → Magic link:** so links work when opened on another device than the one that requested them, set the link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink`
6. **Auth → SMTP:** enable custom SMTP with Resend (host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key, sender = your verified domain address). The built-in sender is limited to 2 emails per hour and only to your team's addresses.
7. **Google OAuth:** Google Cloud Console → APIs & Services → Credentials → OAuth client (Web). Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Paste client ID and secret into Supabase → Auth → Providers → Google.

### Vercel

1. Import the repository in Vercel (framework: Next.js, default build settings).
2. Add every variable from the table above for Production (and Preview if you use it), including both VAPID keys.
3. Deploy, then run the `setup_reminder_cron` SQL above with the real URL.

### Telegram

1. @BotFather → `/newbot`, copy the token and username into Vercel and redeploy.
2. Register the webhook (replace values):
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://<app>/api/telegram" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" -d 'allowed_updates=["message","callback_query"]'
   ```
3. Optional command menu: @BotFather → `/setcommands` →
   ```
   bugun - Bugungi ishlar
   ertaga - Ertangi ishlar
   hafta - Shu hafta
   yangi - Yangi vazifa
   inbox - Kiruvchi
   ```
4. In Reja: Settings → Telegram va kalendar → Telegramni ulash → send the code to the bot. "Sinov xabari yuborish" sends a test message.
5. Group posts: add the bot to a group, open a project → ⋯ → Sozlamalar → Telegram guruh, and send the shown `/ulash CODE` in the group. For the bot to read commands in groups, disable privacy mode in BotFather (`/setprivacy` → Disable) or address it as `/ulash@yourbot CODE`.

### Resend

Add and verify your domain in Resend (DNS records: SPF/DKIM TXT and MX for bounce handling), then set `EMAIL_FROM` to an address on it. Until the domain is verified, Resend only delivers to your own account email.

## 3. Importing your current planner (`planner-export.json`)

Settings → **Eksport va import** → Import → choose `planner-export.json` → check the preview → **Import qilish**.

Mapping (tested with your file: 30 tasks, 5 new projects):

| Planner field | Reja |
|---|---|
| `area` | project (created if missing, distinct colours): Agentlik, Shaxsiy, Shiroq, Topcoach, Xijoma |
| `pri` 3 / 2 / 1 | priority high / medium / low |
| `top` | top 3 on the task's day (or today) |
| `done` | status done |
| `note` | description |
| `bucket` "kun" | due date = `day` |
| `bucket` "hafta" | due date = the coming Saturday (Sat 10 Oct 2026 when imported on Mon 5 Oct) |
| `bucket` "keyin" | no date |
| `due` | deadline (the hard date, shown with a flag) |

Projects are created in the workspace you are currently in. To keep "Shaxsiy" private from a partner, switch to your personal workspace before importing, or set that project's visibility to "Faqat men" afterwards.

## 4. Backups on the free plan

Supabase Free has no downloadable or point-in-time backups, and inactive projects are paused after a week. Two layers:

1. **Nightly database dump** — `.github/workflows/backup.yml` runs `pg_dump` every night and keeps the dumps as workflow artifacts for 90 days. Put the code in a **private** GitHub repo and add the secret `SUPABASE_DB_URL` (Project Settings → Database → Connection string → Session pooler, with your password). Restore with `pg_restore --no-owner -d "<db url>" reja-YYYY-MM-DD.dump`.
2. **Your own export** — Settings → Eksport va import → JSON once a week (everything you can see in the workspace).

Attachments in Storage are not in the dump; download important files or upgrade when that matters.

## 5. Testing and results

```bash
npm test
```

| Suite | What it covers | Result |
|---|---|---|
| `tests/unit/quick-add` | Uzbek + English parsing: dates, weekdays with suffixes, times (`soat 15 da`, `5pm`, `kechqurun 7`), recurrence, `#project` (multi-word, apostrophe variants, prefix), `@person`, `!1–!4`, `*`, false positives | ✅ 21 |
| `tests/unit/recurrence` | rrule in Tashkent and New York, across DST in both directions, overdue roll-forward, month end | ✅ 10 |
| `tests/unit/reminders` | offsets, all-day 09:00, quiet hours across midnight, digest/review windows | ✅ 11 |
| `tests/unit/scheduler` | idempotency (two runs, one send), quiet-hour queueing, dismissal, retries, digest once per day, weekly review, channel preferences | ✅ 7 |
| `tests/unit/complete` | recurring completion copies subtasks, checklist, labels, assignees, shifted reminders | ✅ 2 |
| `tests/unit/import` | planner JSON mapping (incl. your real file), CSV with BOM and Uzbek values, validation | ✅ 5 |
| `tests/unit/permissions-health`, `reports`, `habits`, `ics`, `i18n` | permission mirror, health rules, report metrics, streaks, ICS escaping/folding, message key parity and `ʻ` usage | ✅ 20 |
| `tests/db/rls` | **Real Postgres (PGlite)** with all migrations: guests can't read or write outside their project, viewers can't write, private projects, inbox privacy, forged columns, scheduler RPCs locked down | ✅ 23 |
| `tests/db/triggers` | auto reminders (09:00 local, offsets, assignee changes, completion), claim idempotency, rate limit, notifications, activity diffs, subtask moves | ✅ 12 |
| `tests/db/server-queries` | responsible tasks re-check access, ICS items by token | ✅ 5 |

Also: `npm run lint` (React Compiler rules) and `npm run typecheck` are clean; `npm run build` passes; the UI was checked in the browser in demo mode on desktop and a 375 px phone in light/dark and Uzbek/English.

**End-to-end** (`npm run test:e2e`) needs a Supabase project: put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` of a **test** project in `.env.test.local`, run `npx playwright install chromium`, then the suite covers sign-up → project → quick add with parsing → board move → reminder → complete → reports, guest access isolation, and the mobile shell.

## 6. Free-tier limits that matter

| Service | Limit | What it means for Reja |
|---|---|---|
| Supabase Free | 500 MB database, 1 GB storage, 5 GB egress, 50k MAU, 2 projects | Plenty for one team; attachments are the first thing to grow |
| Supabase Free | Paused after ~7 days without activity | The every-minute cron keeps it active in practice; if paused, restore from the dashboard |
| Supabase Free | No downloadable / PITR backups | Use the backup workflow above |
| Supabase Auth | Built-in email: 2 per hour, team addresses only | Configure Resend SMTP before inviting anyone |
| Vercel Hobby | Non-commercial use only; 100k function invocations and 100 GB-hours per month; 60 s max duration | The reminder cron alone uses ~43k invocations/month. For a business, use Vercel Pro |
| Resend Free | 3,000 emails/month, 100/day, 1 domain; other recipients need a verified domain | Fine for invites and an occasional digest; keep email digests off unless needed |
| Web Push on iPhone | Only for the installed home-screen app, iOS 16.4+ | Explained in Settings → Bildirishnomalar |

Limits change; check [supabase.com/pricing](https://supabase.com/pricing), [vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby) and [resend.com/pricing](https://resend.com/pricing) before relying on them.

## 7. Known limitations

- Developed without Docker, so `supabase start` was not used; migrations and RLS were verified in PGlite (real Postgres compiled to WebAssembly). Storage policies, Realtime authorisation and pg_cron are Supabase-only and are verified on the hosted project.
- End-to-end tests and a Lighthouse run need the hosted project and have not been run yet.
- Offline: the last loaded data and quick add work offline; pages never opened while online aren't available offline. Conflicts are last-write-wins per field.
- The client loads open tasks plus the last 16 weeks of completed ones; older history stays in the database (reports cover 16 weeks).
- Activity entries created by the bot or scheduler show "Tizim" as the actor.
- Telegram group posts are sent by the minute job, so they can lag by up to a minute.
- Sentry and Vercel Analytics are not wired in (optional in the brief).
