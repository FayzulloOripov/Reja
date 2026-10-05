# Reja — build plan

Work and project hub for one busy person running several projects, shared with a partner and guests. Uzbek-first UI, Telegram reminders, PWA, free-tier deployable (Vercel + Supabase).

## Architecture

```
Browser (PWA)                                   Vercel (Next.js 16, Node runtime)
┌──────────────────────────────┐                ┌───────────────────────────────────────┐
│ React 19 client app          │  supabase-js   │ proxy.ts       session refresh, auth gate│
│  ├ zustand store (all rows)  │◄──────────────►│ /auth/callback  magic link + Google     │
│  ├ outbox (offline writes)   │  RLS-protected │ server actions  import, invites, export │
│  ├ IndexedDB snapshot        │  REST+Realtime │ /api/telegram   grammY webhook          │
│  └ service worker (sw.js)    │                │ /api/cron/reminders  scheduler (secret) │
└──────────────────────────────┘                │ /api/ics/[token]    calendar feed       │
                                                │ /share/[token]      read-only project   │
Supabase                                        └───────────────────────────────────────┘
 Postgres + RLS ─ pg_cron (every minute) ─ pg_net ─► /api/cron/reminders
 Auth (magic link, Google) · Storage (attachments) · Realtime (postgres_changes + presence)
```

**Data flow.** After sign-in the client loads every row the user can see (RLS does the filtering) into a normalised zustand store, persisted to IndexedDB. All views (Home, lists, board, calendar, timeline, reports) are derived in memory, so switching views is instant and works offline. Writes are applied optimistically, queued in an outbox, and flushed in order to Supabase; failures roll back with a toast; network loss keeps them queued (offline quick-add). Realtime `postgres_changes` per workspace keeps every client in sync.

**Server-only work** (service role, never shipped to the client): scheduler (reminders, digest, weekly review, overdue nudge, notification fan-out to Telegram/Push/email, Telegram group posts), Telegram bot, ICS feed, public share page, invitation acceptance, import.

**Demo mode**: the same store runs against an in-browser adapter with clearly fake seed data and a fake user, so the whole UI can be exercised without Supabase. The real backend is the default; a visitor opens the demo at `/demo` (cookie `reja_demo`, left with `/demo/exit`), and `NEXT_PUBLIC_DEMO=1` forces the whole deployment into demo mode for local development and tests. Server features are disabled in the demo; what was typed there can be imported after sign-up.

## Database schema (supabase/migrations)

| Table | Key columns |
|---|---|
| profiles | id→auth.users, name, avatar_url, timezone (Asia/Tashkent), language (uz/en), theme, work_days int[] (ISO, Mon–Sat), quiet_enabled/start/end, digest_enabled/time (07:30), review_enabled/dow/time (Sun 09:00), overdue_nudge_enabled, default_reminder, telegram_chat_id, notify_prefs jsonb (channel → type → bool), ics_token, onboarded_at, last_digest_on/last_review_on/last_overdue_nudge_on, pomodoro_work/break, current_workspace_id |
| push_subscriptions | user_id, endpoint, p256dh, auth, device_label, last_used_at |
| telegram_link_codes | user_id, code, expires_at, used_at |
| workspaces | name, icon, color, owner_id, is_personal |
| workspace_members | workspace_id, user_id, role owner/admin/member/guest |
| invitations | workspace_id, project_id?, email? (null = link), role, token, expires_at, accepted_at, revoked_at, max_uses, use_count |
| projects | workspace_id, name, description, color, icon, area, status, start/target date, goal, health + health_manual, visibility (workspace/private), owner_id, position, share_token (null = off), telegram_chat_id |
| project_favorites | user_id, project_id, position |
| project_members | project_id, user_id, role manager/member/viewer |
| sections | project_id, name, position |
| tasks | workspace_id (always), project_id (null = creator's inbox), section_id, parent_id, title, description jsonb (TipTap), status, priority, start_date, due_date, due_at (UTC instant when a time is set), deadline, estimate_min, recurrence (RRULE), top_date, position, completed_at, created_by, source |
| task_assignees / task_watchers | task_id, user_id |
| task_dependencies | blocker_id → blocked_id |
| labels / task_labels | per workspace, coloured |
| checklist_items | task_id, text, done, position |
| comments / comment_reactions | body jsonb, body_text, mentions uuid[]; reactions (comment, user, emoji) |
| attachments | task_id or comment_id, storage_path, name, size, mime |
| time_entries | task_id, user_id, started_at, minutes |
| reminders | user_id, task_id? (null = standalone + title), remind_at UTC, offset_rule, channels[], status pending/sending/sent/snoozed/dismissed/failed, attempts, sent_at |
| notifications | user_id, type, actor_id, task/project, title, body, url, read_at, delivery (pending/done/skipped), deliver_after |
| activity_log | workspace, project, task, actor, entity, action, diff (pruned after 12 months) |
| goals / key_results / key_result_history | measurable KRs with history |
| notes | project rich-text pages |
| habits / habit_logs | private to owner |
| time_blocks | user, date, start_at, end_at, task?, title |
| saved_views | user or workspace scope, filters/sort/grouping |
| templates | project or task templates (jsonb with relative offsets) |
| rate_limits | key, window_start, count |

Every child table carries `workspace_id` (filled by trigger) so RLS and Realtime filters are a single indexed column.

## RLS approach

All helpers are `security definer`, `stable`, `search_path = ''`, take an explicit user id (default `auth.uid()`), so the same rules are reused by server code running as service role (ICS feed).

- `ws_role(ws)`; full members = owner/admin/member; `guest` sees only projects where they are in `project_members`.
- `project_access(project)` → `manage | write | read | null`:
  - private project: only owner + project_members;
  - workspace project: ws owner/admin → manage, ws member → write, project member role manager → manage, member → write, viewer → read.
- Tasks: inbox tasks (`project_id is null`) are visible and writable only by `created_by`; project tasks follow `project_access`. Children (assignees, checklist, comments, attachments, deps, labels, time entries) use `can_read_task` / `can_write_task`.
- Private-by-owner tables: habits, habit_logs, time_blocks, reminders, notifications, push_subscriptions, telegram_link_codes, personal saved_views, favorites.
- Viewers can read but never write; guests cannot see anything outside their projects (tested in `tests/rls`).
- Public project link: `share_token` read by a server route with the service role; RLS is never loosened.
- Storage bucket `attachments` (private): path `{workspace}/{task}/{file}`, policies call `can_read_task` / `can_write_task`.
- Realtime presence uses private channels authorised by `can_read_project`.

## Routes

| Route | Purpose |
|---|---|
| `/login`, `/auth/callback`, `/auth/confirm` | magic link + Google |
| `/onboarding` | language, timezone, work days, first projects, Telegram, push |
| `/` | Home "Bugun" dashboard |
| `/inbox` | triage |
| `/upcoming` | next 14 days |
| `/overview` | workspace shared dashboard |
| `/projects/[id]?view=list\|board\|calendar\|timeline\|table\|overview\|notes` | project |
| `/goals`, `/habits`, `/focus`, `/reports`, `/workload`, `/notifications` | insight |
| `/settings/{profile,notifications,integrations,workspace,members,labels,templates,trash,data}` | settings |
| `/invite/[token]`, `/share/[token]` | invitation accept, public read-only project |
| `/api/telegram`, `/api/cron/reminders`, `/api/ics/[token]`, `/api/export` | server |

## Design tokens

- Fonts: **Onest** (UI; full Latin Extended incl. `ʻ` U+02BB, `tnum`), **Schibsted Grotesk** (display headings). Both verified to contain U+02BB.
- Neutral scale with a warm hue (stone-ish, oklch hue ~70), brand accent: deep tangerine/amber `oklch(0.64 0.17 45)`; semantic success (green), warning (amber), danger (red), info (blue).
- 10 project colours (tomato, tangerine, amber, lime, emerald, teal, sky, indigo, violet, rose) with `fg`/`bg`/`solid` variants tuned per theme for AA contrast.
- Type scale 12/13/14/16/18/22/28/36; spacing 4-pt; radius 6/10/14/20; elevation 1–4 layered soft shadows; motion 150–250 ms ease-out, disabled under `prefers-reduced-motion`.

## Phase checklist

- [x] 1 Foundation — repo, design system, auth (magic link + Google), workspaces, membership, RLS, i18n, PWA shell, layout
- [x] 2 Core — projects, sections, tasks, subtasks, checklist, labels, list/board, task panel, quick add + parser, inbox, palette
- [x] 3 Collaboration — invitations, guests, realtime, comments, mentions, attachments, notifications, activity
- [x] 4 Time — calendar, timeline, recurrence, time blocks, Home, overview, plan tomorrow, ICS
- [x] 5 Reminders — reminders, pg_cron, web push, email, Telegram bot, digest, weekly review
- [x] 6 Insight — goals, habits, focus, reports, workload
- [x] 7 Data — export, import (CSV + planner JSON), trash, templates, onboarding
- [~] 8 Polish & ship — empty states, motion, a11y, README, deploy docs done; Playwright suite written; e2e run, Lighthouse and live deploy need the Supabase/Vercel/Telegram credentials

## Decisions and deviations

- Docker is not available on the build machine, so `supabase start` cannot run. Migrations and RLS are tested against PGlite (real Postgres compiled to WASM) with a small Supabase shim (`auth.uid()`, roles); pg_cron/pg_net/storage/realtime migrations are marked `-- pglite:skip` and verified on the hosted project.
- Tasks have both `due_date` (the day it is planned for) and `deadline` (hard date). The planner import needs both: `bucket/day` → due date, `due` → deadline.
- Due time is stored as `due_at timestamptz` (UTC) alongside the local `due_date`.
- Projects have a `visibility` flag so a personal project can live in a workspace shared with a partner without the partner seeing it.

## Round 2 — fix prompt (user testing)

AUDIT.md tracks every item. Phases:

- [x] 1 Audit and bugs — AUDIT.md; section 1 items 3–4, 7–15, 17–22, 24–29 fixed with tests (`e2e/demo`, `tests/unit/testing-fixes.test.ts`, `tests/db/testing-fixes.test.ts`); migration `20261006000001_testing_fixes.sql`
- [ ] 2 Backend — Supabase as default (keys needed), demo separation, demo-data import, first-run wizard
- [ ] 3 Projects and areas — Projects page, areas, workload, activity log, delegated view
- [ ] 4 Check list — everything in «not tested yet», fixed and tested
- [ ] 5 Organisation — waiting-for, contacts, meetings, weekly review, daily shutdown, routines
- [ ] 6 Business modules — pipeline, money, docs, goals fed by data
- [ ] 7 Communication and personal — Telegram group digests and replies, email digest, Google Calendar, PWA, prayer times, energy labels
- [ ] 8 Data, trust, ship — import, backups, sessions, audit log, deploy, Lighthouse, Playwright

Decisions in round 2:
- Demo is a runtime mode (`/demo` cookie) instead of a build flag, so one production build serves both and the demo e2e suite runs in CI without keys.
- Numbers are formatted by hand (`formatNumber`): Chrome's ICU formats `uz` like English.
- Focus sessions are `time_entries` with `source = 'focus'` (task optional); Home and Focus read the same rows.
- Deadlines use a signpost icon in violet; flags are reserved for priority.
- Recurring occurrences link to their source (`tasks.recurrence_parent_id`, unique while live), which makes completion idempotent and undo exact.
