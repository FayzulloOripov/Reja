# Reja

A work and project hub for one busy person running several projects at once, shared with a partner and guests. Uzbek-first (English toggle), installable PWA, deployable on Vercel + Supabase.

- **Bugun (Home):** top 3, today by project, overdue, next 7 days, day timeline (time blocks, prayer times, Google busy time), «Hozir nima qilay?» energy suggestions, habits, routines, close-the-day card, weekly stats
- **Work organisation:** areas above projects, projects (List, Board, Calendar, Timeline, Table, Overview, Notes/Docs), waiting-for with follow-ups, outside contacts, meetings with agenda/decisions → tasks, guided weekly review, daily shutdown, routines
- **Tasks:** side panel / mobile sheet, subtasks, checklist, dependencies, labels, assignees, watchers, attachments, comments with @mentions, activity, recurrence, reminders, time tracking, energy labels («chuqur ish» / «tez ish»)
- **Business modules** (switched on per workspace): pipeline (stages, stale warnings, conversion, won deal → project), money (UZS/USD, partner split, approvals of large expenses), docs (versions, linked tasks); goals with key results fed by real data
- **Reminders:** per task and standalone, quiet hours, prayer-aware (optional), daily digest, weekly review, overdue nudge, close-the-day push — by Web Push and email (Telegram is built but postponed)
- **Data and trust:** soft delete with trash and undo, JSON/CSV export and a one-click full export, weekly backup by email, planner-JSON and CSV import, demo-data import after sign-up, device list with sign-out elsewhere, audit log for admins, offline reading and offline quick add

Status of every item: [AUDIT.md](AUDIT.md). Architecture and schema: [PLAN.md](PLAN.md).

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 + shadcn/ui (Radix) · Motion · dnd-kit · Recharts · cmdk · TipTap · zustand · Supabase (Postgres + RLS, Auth, Storage, Realtime, pg_cron, pg_net) · next-intl · web-push · Resend + React Email · adhan · Zod · Vitest · PGlite · Playwright.

## Run locally

```bash
npm install
```

```bash
npm run dev
```

Without any keys the app runs as the demo at `/demo` (sample data kept only in your browser). With keys in `.env.local` (see below) it uses Supabase; `/demo` stays available for visitors.

## 1. Environment variables

Copy `.env.example` to `.env.local` and fill it in. Nothing here is ever committed.

| Variable | Where it comes from | Needed for |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Your production URL, e.g. `https://reja.vercel.app` | links in emails, OAuth redirects |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL | everything |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys → Publishable key (`sb_publishable_…`) | everything |
| `SUPABASE_SECRET_KEY` | Supabase → API Keys → Secret key (`sb_secret_…`). **Server only** | scheduler, exports, backups, Google sync, tests |
| `SUPABASE_DB_URL` | Supabase → Connect → Session pooler connection string (with your DB password) | `npm run db:push`, remote DB tests |
| `CRON_SECRET` | `openssl rand -hex 32` | `/api/cron/reminders` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` | Web Push |
| `VAPID_SUBJECT` | `mailto:you@yourdomain` | Web Push |
| `RESEND_API_KEY` | resend.com → API Keys | emails (digest, review, backups, invites) |
| `EMAIL_FROM` | `Reja <reja@yourdomain.uz>` on a domain verified in Resend | emails to anyone but yourself |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console (see below) | two-way Google Calendar (optional) |
| `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | @BotFather — **postponed**: leave empty, Telegram stays hidden («Tez orada») | Telegram |
| `NEXT_PUBLIC_DEMO` | `1` makes the whole site the demo (no Supabase) | demo deployments only |
| `ALLOW_DEMO_SEED` | `false` in production | `npm run seed:demo` guard |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | error monitoring |

## 2. Setup step by step

### Supabase

1. Create a project (region close to Tashkent, e.g. Frankfurt). Save the database password.
2. Put `SUPABASE_DB_URL` in `.env.local`, then push every migration (tables, RLS, triggers, storage bucket, Realtime, pg_cron, pg_net):
   ```bash
   npm run db:push
   ```
3. **Auth → URL Configuration:** Site URL = your production URL; Redirect URLs = `https://<app>/auth/callback`, `https://<app>/auth/confirm` (plus `http://localhost:3000/**` for development).
4. **Auth → Email templates** — set **both** «Magic link» (returning users) and «Confirm signup» (a person's very first sign-in) so the email carries the link *and* a 6-digit code. The code is what an app installed on a phone's home screen needs: the phone opens the link in the browser, not in the app, so the person types the code into the sign-in screen instead. Body for both:
   ```html
   <h2>Rejaga kirish</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Kirish uchun shu yerni bosing</a></p>
   <p>Yoki ilovada shu kodni kiriting: <strong style="font-size:22px;letter-spacing:4px">{{ .Token }}</strong></p>
   <p>Havola va kod 1 soat amal qiladi. Siz soʻramagan boʻlsangiz, bu xatga eʼtibor bermang.</p>
   ```
   (Auth → Providers → Email: keep the OTP length at 6 digits.)
5. **Auth → SMTP:** custom SMTP with Resend (host `smtp.resend.com`, port `465`, user `resend`, password = Resend API key, sender on your verified domain). The built-in sender allows 2 emails per hour.
6. **Google sign-in (optional):** Google Cloud Console → Credentials → OAuth client (Web), redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`; paste ID and secret into Supabase → Auth → Providers → Google.
7. **Reminder job** — once the app is deployed, in the SQL Editor:
   ```sql
   select public.setup_reminder_cron('https://<your-app>/api/cron/reminders', '<CRON_SECRET>');
   ```
   It runs every minute (reminders, digests, close-the-day, weekly backups, Google sync) and nightly cleanup. Check with `select * from cron.job_run_details order by start_time desc limit 5;`.

### Vercel

1. Log in once on this machine, then link and deploy:
   ```bash
   npx vercel login
   ```
   ```bash
   npx vercel link
   ```
2. Add every variable from the table to the Vercel project (Production), then:
   ```bash
   npx vercel --prod
   ```
3. Run the `setup_reminder_cron` SQL above with the production URL.

### Web Push (VAPID)

Generate once (`npx web-push generate-vapid-keys`), put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in `VAPID_PRIVATE_KEY`. Users switch push on in Settings → Bildirishnomalar (on iPhone only from the installed home-screen app, iOS 16.4+).

### Resend

Add and verify your domain (SPF/DKIM TXT, MX), set `EMAIL_FROM` to an address on it. Until then Resend delivers only to your own account email; every email feature is skipped quietly while `RESEND_API_KEY` is empty.

### Google Calendar (two-way, optional)

Google Cloud Console → APIs & Services: enable **Google Calendar API**; OAuth consent screen (add yourself as a test user while unverified); Credentials → OAuth client ID (Web application) with the redirect URI `https://<your-app>/api/google/callback`. Put the ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Then Settings → Integratsiyalar → «Google Calendar’ni ulash».

### Telegram (postponed)

The bot, group digests, replies-as-comments and Telegram reminders are built but hidden until a bot token exists. When you have one: set the three Telegram variables, redeploy, and register the webhook:
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://<app>/api/telegram" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" -d 'allowed_updates=["message","callback_query"]'
```

## 3. Importing your data

**Old planner (`planner-export.json`):** Settings → Eksport va import → Import → choose the file → in the preview pick, for each planner area, a new area + project, an existing project or the inbox → «Import qilish». `pri` → priority, `top` → top 3, `done` → done, `note` → description, `bucket` kun/hafta/keyin + `day` → dates, `due` → deadline, `created` kept. A summary lists what was added and what was skipped and why.

**CSV:** same place: map the columns, check the first 10 rows, skip duplicates, read the summary.

**What you typed in the demo:** keep using the same browser, sign up, then Settings → Eksport va import → «Demodagi maʼlumotlaringiz» → choose «Faqat men kiritganlar» or «Hammasi» → «Hisobimga oʻtkazish». Projects, tasks, subtasks, checklists, notes, habits, contacts, meetings, routines, deals, money and document links move with new ids; the business modules they use are switched on.

**Sample data into a real account (testing only):**
```bash
ALLOW_DEMO_SEED=true npm run seed:demo -- --email you@example.com
```

## 4. Backups

- **Weekly backup by email:** every Sunday night the workspaces you own are emailed to you as JSON (Settings → Eksport va import → Zaxira nusxa; on by default; needs Resend).
- **One click:** «Hammasini yuklab olish» downloads every workspace plus your personal data as one JSON file.
- **Database dump:** `.github/workflows/backup.yml` runs `pg_dump` nightly in a private GitHub repo with the secret `SUPABASE_DB_URL`.

## 5. Tests

```bash
npm test
```
```bash
npm run test:db:remote
```
```bash
npm run test:e2e:demo
```
```bash
npm run test:e2e:real
```

- `npm test` — unit tests and database tests (RLS for every table, triggers, business rules) on PGlite (real Postgres in WebAssembly) with all migrations.
- `test:db:remote` — the same database tests against your Supabase project (users are tagged and removed afterwards).
- `test:e2e:demo` — Playwright in the demo (needs `npm run build` and `npx next start -p 3100`, with `E2E_BASE_URL=http://localhost:3100`).
- `test:e2e:real` — the same Playwright specs against Supabase: every test signs in a fresh user seeded with the demo data, and the users are deleted afterwards.

Latest results are in [AUDIT.md](AUDIT.md#test-results).

## 6. Free-tier limits that matter

| Service | Limit | What it means for Reja |
|---|---|---|
| Supabase Free | 500 MB database, 1 GB storage, 5 GB egress, 50k MAU | plenty for one team; attachments grow first |
| Supabase Free | paused after ~7 days without activity | the every-minute cron keeps it active |
| Supabase Free | no downloadable / PITR backups | weekly email backup + the dump workflow |
| Vercel Hobby | non-commercial use; 100k function invocations/month; 60 s max | the minute cron uses ~43k/month; for a business use Pro |
| Resend Free | 3,000 emails/month, 100/day, 1 domain | fine for digests and weekly backups |
| Google Calendar API | 1M requests/day | the 15-minute sync is far below it |

## 7. Known limitations

- Telegram is postponed (no bot token); email waits for a verified Resend domain; two-way Google Calendar waits for an OAuth client — each is built and switches on when its keys are set.
- Signing out another device takes effect at that device's next token refresh (within an hour).
- Offline: the last loaded data and quick add work offline; conflicts are last-write-wins per field.
- Prayer times use the Muslim World League method; local mosques can differ by a few minutes.
