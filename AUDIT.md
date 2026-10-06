# Reja — audit

Status of every feature in the original spec and in the fix prompt.
**done** = built and tested · **partial** = works but something is missing (noted) · **missing** = not built · **broken** = built but wrong · **blocked** = needs credentials or an outside service.

Tests: `tests/unit` (Vitest) · `tests/db` (Postgres/RLS — on PGlite by default, and against the Supabase project with `npm run test:db:remote`) · `e2e/demo` (Playwright — against the in-browser demo with `npm run test:e2e:demo`, and the same tests against the real Supabase backend with `npm run test:e2e:real`, each test signing in a freshly seeded real account).

_Last updated: switch to the real backend (before phase 5)._

**Telegram is postponed** (no bot token): every Telegram item below is marked *postponed*, its controls are hidden or shown as «Tez orada», and reminders, the daily digest, the weekly review and the overdue nudge go out by web push (and email once Resend is set up). The app runs fully without `TELEGRAM_BOT_TOKEN`.
**Email is waiting** for the Resend key and a verified domain: email sending is skipped while `RESEND_API_KEY` is empty.

## 1. Bugs from user testing

| # | Bug | Status | Fix (files) | Test |
|---|---|---|---|---|
| 1 | Demo mode only, nothing reaches a server | done | Supabase is the default; the demo is `/demo` (cookie) or `NEXT_PUBLIC_DEMO=1` — `src/app/demo`, `src/lib/demo/server.ts`, `src/proxy.ts`; «Roʻyxatdan oʻtish» from the demo; after sign-up «Demodagi maʼlumotlaringiz» moves what was typed (`lib/demo/import.ts`, `settings/demo-import.tsx`, onboarding import step). Connected to the Supabase project: all migrations applied (`npm run db:push`), RLS checked on the real database, the Playwright suite passes against it, and the demo → account import is verified end to end. | unit `demo-import` · e2e `backend.spec` · real e2e `demo-import.spec` |
| 2 | No projects page | done | `/projects`: grouped by area, search, status/area/health filters, progress, health with reason, next date, favourite, archive/restore, delete with confirm, drag to reorder or move between areas; the phone tab opens it | e2e `projects.spec` |
| 3 | Broken initials «H(» | done | `src/lib/text.ts` `initials()` | unit `testing-fixes` · e2e `initials skip brackets` |
| 4 | Upcoming «12-okt · 12-okt», empty-day headers | done | `src/app/(app)/upcoming/page.tsx`, `TaskList` gap rows, `useFormat().weekdayDate` | unit `format` · e2e `upcoming shows weekday…` |
| 5 | Activity feed empty | done | database triggers already log create/update/complete/comment/assign/move; the demo now mirrors them (`lib/activity.ts`) and keeps them; feeds reload after changes (`useActivity`); moves and assignments read as sentences | unit `activity` · e2e `activity feed…` |
| 6 | Workload misleading | done | one owner rule everywhere (`lib/tasks/responsible.ts`: assignees, else the creator — same as reminders in the database), each person's work days (days off hatched) and daily capacity in tasks or hours (Settings → Profile) | unit `workload` · e2e `workload counts…` |
| 7 | Garbled overview row | done | `src/app/(app)/overview/page.tsx` | e2e `overview workload row…` |
| 8 | Locale formatting (1.0, raw minutes) | done | `formatNumber` (hand-rolled: browsers ship incomplete Uzbek ICU), `useFormat().num/hoursTick`, reports time axis in hours | unit `format` · e2e `reports…` |
| 9 | Report period mismatch | done | every KPI and card follows the selected weeks and says so — `reports/page.tsx`, `lib/reports.ts` | e2e `reports…` |
| 10 | Confusing notification filters | done | «Tilga olishlar», «Izohlar», «Menga berilgan», «Eslatmalar» with icons — `notifications/page.tsx` | e2e `notification filters…` |
| 11 | Greeting ignores time zone | done | `partOfDay` (05–11/11–17/17–22/22–05) from the user's zone — `lib/dates.ts`, Home | unit + e2e (clock fixed to 12:30 Tashkent) |
| 12 | Undo too easy to miss | done | custom undo toast: 8 s, pauses on hover/touch/focus, 44 px button, above the tab bar — `components/common/undo-toast.tsx`; «Bugun bajarilganlar» on Home; reopening a recurring task removes the occurrence it generated | e2e desktop + mobile undo tests |
| 13 | Unlabelled icon buttons | done | icon buttons get an automatic desktop tooltip from `aria-label` (`ui/button.tsx`), tooltips off on touch (`ui/tooltip.tsx`), Uzbek close labels, priority = coloured flag with its word as name, status/priority read once | e2e `every visible button and link has an accessible name` (9 pages) |
| 14 | Settings hard to find | done | gear in the sidebar footer, «Sozlamalar» tile in «Yana», section list on phones — `components/settings/settings-shell.tsx` | e2e desktop + mobile settings tests |
| 15 | Demo banner wastes space | done | collapses to a pill after «Yashirish», remembered — `components/shell/demo-banner.tsx` | e2e `demo banner collapses…` |
| 16 | Delegated tasks disappear | done | «Kutilmoqda» page (`/waiting`, grouped by person) and Home card «Boshqalardan kutilayotgan»; waiting-for items join the same page in phase 5 | unit `responsible` · e2e `delegated tasks stay visible` |
| 17 | Raw ISO date in toast | done | shared formatter for non-React code (`lib/i18n-client.ts formatter()`) → «Keyingisi: ertaga, 6-okt» | e2e `completing a recurring task…` |
| 18 | Two unlabelled dates | done | due date = calendar icon, deadline = violet signpost, both with label/tooltip; one «next date» rule (`lib/tasks/key-dates.ts`) used by overview, project overview, deadlines list | unit `next key date` · e2e `project list labels…` |
| 19 | Empty board columns vanish | done | all columns always shown with a drop hint — `board-view.tsx` | e2e `board keeps empty columns…` |
| 20 | Mobile board and calendar | done | 85 vw columns with scroll-snap and «1/4» indicator; calendar opens as agenda on phones, plus 3-day, week, month | e2e `board columns snap…`, `calendar opens as an agenda…` |
| 21 | Timeline cluttered | done | finished work hidden (toggle), «Sanasi yoʻq» tray draggable onto the chart, days off from the user's work days | e2e `timeline hides finished work…` |
| 22 | «At risk» without a reason | done | reason next to the badge everywhere («5 kun qoldi, 50% bajarildi, 1 ta kechikkan»), owner override with a note (`projects.health_note`) | unit `health reason` · db `project health note` · e2e `health badge explains…` |
| 23 | Activity empty after real actions | done | see 5; task history says «Siz yaratgansiz» / the person's name | e2e `activity feed…` |
| 24 | Focus numbers contradict | done | finished sessions are time entries with `source='focus'` (task optional); Home and Focus read the same rows; stopped sessions log time to the task only; break starts when the work phase ended (survives lock/reload) | unit `focus summary` · db `focus sessions` · e2e `focus page and Home…` |
| 25 | Goal percentages unexplained | done | «qanday hisoblangan» popover, start value shown, pace marker and sentence, confirm before deleting a key result, goal start date | unit `goal progress` · e2e `goal percentage…` |
| 26 | Habit heatmap unlabelled | done | month and weekday labels, legend, «odat hali yoʻq edi» style, clear «Bugun bajardim» button | e2e `habit heatmap…` |
| 27 | Notification settings on a phone | done | one card per event with labelled switches on phones, full phrases, push refusal only after trying, one enable button, quiet hours 22:00–07:00 shown, default reminder 15 min (timed) / 09:00 (all-day) in app and database | e2e mobile settings · unit + db reminder timing |
| 28 | Developer text shown to users | done (Telegram itself postponed) | no variable names shown; the Telegram card says «Tez orada» while the bot is postponed | e2e `Telegram settings…` |
| 29 | Small polish | done | quick-add close button; tooltips off on touch and row toolbar hidden on touch; subtask input stays open; «Fayl tanlash» on phones; mention list opens above when there is no room; palette reads status once; one add row on Home today; search shows dates; overdue group has no add row | e2e `quick add…`, `subtask input…`, `file area…`, `search results…` |

### Found while switching to the real backend

- Deleting an account failed for anyone who owned a workspace (`workspaces.owner_id` had no delete rule). Now the personal workspace goes with the account and a shared one passes to another admin/member (`20261006000005_account_deletion.sql`, db test `account deletion`).
- The demo → account import sent its rows as deletes (the items had no operation kind, hidden by a cast). Items are explicit inserts now, the adapter refuses unknown operations, and sample rows the visitor changed (e.g. completed) are imported too. Verified against Supabase (`e2e/demo/demo-import.spec.ts`).
- Checklist inputs had no accessible names.

### Also fixed in phase 3

- Home overflowed sideways at phone width once filter chips were added (grid track sized to content): pinned to `minmax(0,1fr)`; new e2e check that no page scrolls sideways at 390 px.
- Escape did not close the task panel (global shortcuts ignored keys while any dialog was open, including the non-modal panel).
- The demo dropped its seeded comments and activity on load.

### Also fixed in phase 2

- Demo data could be lost on a quick reload: the IndexedDB snapshot is now saved on the first change at once (throttled, not debounced) and again on `pagehide`. Covered by e2e `planner JSON import … survives a reload`.

## 2. Worked in testing — keep working

| Item | Status | Test |
|---|---|---|
| Quick add `ertaga 10:00 #Agentlik @Hamkor !1 *` | done | unit `quick-add` |
| Search (top icon, Ctrl+K) | done | e2e `search results show the task's date` |
| Subtasks | done | e2e `subtask input stays open` |
| @ mention suggestions | done | — (phase 4) |
| Drag between board columns persists | done | — (phase 4) |
| Swipe right to complete | done | — (phase 4) |
| Recurring task creates next occurrence | done | unit `complete` |
| Light theme, desktop sidebar | done | visual check |

## 3. Not tested yet (phase 4)

All items in section 2 «Not tested yet» of the fix prompt: pending.

## 4. Missing features (phases 3, 5–8)

| Feature | Status |
|---|---|
| Areas above projects | done — table + RLS (shared/private, guests see areas of their projects), picker, wizard, Projects page, sidebar grouping, Home and Reports area filter | db `areas` |
| Waiting-for list | missing |
| Outside contacts | missing |
| Meetings and agenda | missing |
| Guided weekly review | missing |
| Daily shutdown | missing |
| Routines | missing |
| Pipeline | missing |
| Money | missing |
| Docs with version history | missing |
| Telegram group digests | postponed (no bot token) |
| Telegram replies → comments | postponed (no bot token) |
| Email digest fallback | waiting (Resend key) — built: digest/review emails when the email channel is on; push carries the summaries meanwhile |
| Prayer-aware planning | missing |
| Energy labels | missing |
| Planner JSON import with real file | done — each planner area → area + project (or existing/inbox), confirmed in a preview; `created` kept; tested against the real file (30 tasks, 5 areas) |
| CSV import mapping/preview/duplicates/summary | done — `settings/import.tsx`, `lib/import/planner.ts`; unit + e2e |
| Export download button in demo | done (built in the browser) |
| Weekly backups to owner | missing |
| Session/device list | missing |
| Audit log | missing |
| Two-way Google Calendar | missing |
| Goals fed by real data | missing |
| PWA badge, share target | missing |
| First-run wizard (full) | done — name/time zone, work days and hours (Mon–Sat, 10:00–19:00), areas + first projects, push (Telegram postponed), import (planner/CSV/demo), invite a partner; every step skippable, reopen from Settings → Profile |

## 5. Original spec

| Area | Status | Where |
|---|---|---|
| Uzbek UI + English toggle, ʻ apostrophe | done | `messages/`, `tests/unit/i18n.test.ts` |
| PWA, offline lists, offline quick add | done | `public/sw.js`, store outbox + IndexedDB |
| Optimistic updates, realtime, skeletons | done | `src/store/*` |
| RLS on every table | done | `supabase/migrations/*_rls.sql`; `tests/db/rls-matrix.test.ts` covers all 35 tables (owner, full member, project viewer, outsider, signed-out) and fails when a table is added without coverage; passes on PGlite and on the Supabase project |
| Supabase backend | done | project connected, migrations applied, storage/realtime/cron verified (`tests/db/supabase-only.test.ts`) |
| Free-tier deploy (Vercel) | pending | README |
| UTC storage, user zone | done | `lib/dates.ts` |
| 30-day trash, undo, export | done | settings trash/data, undo toast |
| Accessibility | done (phase 1 pass) | e2e accessible-name test |
| Auth magic link + Google | done in code, blocked live | `src/app/login`, `src/app/auth` |
| Workspaces, members, invitations, guests | done | settings/workspace, `share-dialog.tsx`, RLS tests |
| Projects: list, board, calendar, timeline, table, overview, notes | done | `components/projects/*` |
| Task panel | done | `components/tasks/task-detail*.tsx` |
| Quick add + parser | done | `lib/parse/quick-add.ts` |
| Recurrence | done | `lib/recurrence.ts`, `lib/tasks/complete.ts` |
| Bulk actions, inbox triage, swipes | done | `bulk-bar.tsx`, `inbox`, `task-row.tsx` |
| Command palette, shortcuts | done | `command-palette.tsx`, `shortcuts.tsx` |
| ICS feed | done | `src/app/api/ics` |
| Notifications inbox | done | `notifications/page.tsx` |
| Workload | done | `workload/page.tsx`, `lib/workload.ts` |
| Reminders, pg_cron, push | done in code, live check pending | `src/server/*`, `supabase/migrations/*_cron.sql`; digest/review/overdue also by push (`20261006000004_push_summaries.sql`) |
| Email (invites, digest, review) | waiting (Resend key) | `src/server/email.ts` |
| Telegram bot (link, commands, forwarding, inline buttons, Telegram reminders) | postponed (no bot token) | code kept in `src/server/telegram.ts`, `src/app/api/telegram`; hidden in the UI |
| Digest, weekly review prompt, overdue nudge | done in code, blocked live | `server/scheduler/core.ts` |
| Goals, habits, focus, reports | done | `src/app/(app)/*` |
| Settings | done | `components/settings/*` |
| CSV + planner import | done | `lib/import/planner.ts`, `components/settings/import.tsx` |
| Onboarding | done | `src/app/onboarding/onboarding-client.tsx` |
| Lighthouse ≥ 90 | not run | phase 8 |
