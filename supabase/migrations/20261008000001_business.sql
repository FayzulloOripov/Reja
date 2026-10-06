-- Round 2, phase 6: business modules (pipeline, money, docs), each switched on per workspace,
-- and key results that update themselves from real data.

-- ---------------------------------------------------------------- workspace settings
alter table public.workspaces
  add column modules jsonb not null default '{"pipeline": false, "money": false, "docs": false}'::jsonb,
  -- UZS for one USD, used for new USD entries and totals
  add column usd_rate numeric(14, 2) not null default 12800 check (usd_rate > 0),
  -- expenses at or above this amount (in UZS) wait for another partner's approval; null = never
  add column approval_threshold_uzs numeric(16, 2) check (approval_threshold_uzs is null or approval_threshold_uzs > 0),
  -- partner split rule: {"fund_pct": 10, "shares": {"<user id>": 50, "<user id>": 50}}; null = off
  add column money_split jsonb;

-- ---------------------------------------------------------------- pipeline
create table public.deal_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  color text not null default 'slate',
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.deal_stages (workspace_id);
create trigger set_updated_at before update on public.deal_stages for each row execute function public.set_updated_at();

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  stage_id uuid not null references public.deal_stages (id),
  title text not null check (char_length(title) between 1 and 200),
  value numeric(16, 2) check (value is null or value >= 0),
  currency text not null default 'UZS' check (currency in ('UZS', 'USD')),
  owner_id uuid references public.profiles (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  source text check (char_length(source) <= 80),
  next_step text check (char_length(next_step) <= 300),
  next_step_date date,
  lost_reason text check (char_length(lost_reason) <= 500),
  project_id uuid references public.projects (id) on delete set null,
  position double precision not null default 0,
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.deals (workspace_id, stage_id);
create trigger set_updated_at before update on public.deals for each row execute function public.set_updated_at();

create table public.deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  from_stage_id uuid references public.deal_stages (id) on delete set null,
  to_stage_id uuid references public.deal_stages (id) on delete set null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index on public.deal_stage_history (deal_id, changed_at);

-- stage rules: the stage belongs to the deal's workspace, a lost deal needs a reason, closing
-- stamps closed_at, and every move is written to the history
create function public.guard_deal()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_kind text;
begin
  select s.kind into v_kind from public.deal_stages s where s.id = new.stage_id and s.workspace_id = new.workspace_id;
  if v_kind is null then
    raise exception 'Stage belongs to another workspace' using errcode = '23514';
  end if;
  if new.contact_id is not null and not exists (select 1 from public.contacts c where c.id = new.contact_id and c.workspace_id = new.workspace_id) then
    raise exception 'Contact belongs to another workspace' using errcode = '23514';
  end if;
  if v_kind = 'lost' and coalesce(btrim(new.lost_reason), '') = '' then
    raise exception 'A lost deal needs a reason' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    new.stage_changed_at := now();
    new.closed_at := case when v_kind in ('won', 'lost') then now() else null end;
  end if;
  return new;
end;
$$;
create trigger guard_deal before insert or update on public.deals for each row execute function public.guard_deal();

create function public.log_deal_stage()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.deal_stage_history (deal_id, workspace_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, new.workspace_id, case when tg_op = 'UPDATE' then old.stage_id end, new.stage_id, auth.uid());
  end if;
  return null;
end;
$$;
create trigger log_deal_stage after insert or update of stage_id on public.deals for each row execute function public.log_deal_stage();

-- ---------------------------------------------------------------- money
create table public.money_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(16, 2) not null check (amount > 0),
  currency text not null default 'UZS' check (currency in ('UZS', 'USD')),
  rate numeric(14, 2) check (rate is null or rate > 0),
  amount_uzs numeric(18, 2) generated always as (case when currency = 'USD' then amount * coalesce(rate, 0) else amount end) stored,
  date date not null default current_date,
  method text not null default 'cash' check (method in ('cash', 'card', 'transfer')),
  -- the partner who received the income or paid the expense
  partner_id uuid references public.profiles (id) on delete set null,
  category text check (char_length(category) <= 60),
  note text check (char_length(note) <= 500),
  -- a direct cost comes off the top before the split
  direct boolean not null default false,
  status text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (currency = 'UZS' or rate is not null)
);
create index on public.money_entries (workspace_id, date);
create trigger set_updated_at before update on public.money_entries for each row execute function public.set_updated_at();

-- Large expenses wait for another partner. Only someone other than the author can approve or
-- reject; changing the amount of a large expense sends it back for approval.
create function public.guard_money_entry()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_threshold numeric;
  v_uzs numeric;
  v_uid uuid := auth.uid();
begin
  select w.approval_threshold_uzs into v_threshold from public.workspaces w where w.id = new.workspace_id;
  v_uzs := case when new.currency = 'USD' then new.amount * coalesce(new.rate, 0) else new.amount end;
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.status := case when new.kind = 'expense' and v_threshold is not null and v_uzs >= v_threshold then 'pending' else 'approved' end;
      new.approved_by := null;
      new.approved_at := null;
    end if;
    return new;
  end if;
  if v_uid is null then
    return new; -- service role (seeding, imports)
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
      raise exception 'Only a pending entry can be approved or rejected' using errcode = '23514';
    end if;
    if v_uid = old.created_by then
      raise exception 'Another partner has to approve this' using errcode = '42501';
    end if;
    new.approved_by := v_uid;
    new.approved_at := now();
  elsif (new.amount, new.currency, new.rate, new.kind) is distinct from (old.amount, old.currency, old.rate, old.kind) then
    if new.kind = 'expense' and v_threshold is not null and v_uzs >= v_threshold then
      new.status := 'pending';
      new.approved_by := null;
      new.approved_at := null;
    elsif old.status = 'pending' then
      new.status := 'approved';
    end if;
  else
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;
  return new;
end;
$$;
create trigger guard_money_entry before insert or update on public.money_entries for each row execute function public.guard_money_entry();

-- ---------------------------------------------------------------- docs (project notes grow versions and linked tasks)
create table public.note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null default '',
  content jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.note_versions (note_id, created_at);

-- Keep the previous text when a document changes, at most one version per author per 10 minutes
-- of continuous editing (autosave would otherwise make one per keystroke pause).
create function public.version_note()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_last record;
begin
  if new.content is not distinct from old.content and new.title is not distinct from old.title then
    return new;
  end if;
  select v.created_by, v.created_at into v_last from public.note_versions v where v.note_id = old.id order by v.created_at desc limit 1;
  if v_last is null or v_last.created_at < now() - interval '10 minutes' or v_last.created_by is distinct from auth.uid() then
    insert into public.note_versions (note_id, workspace_id, project_id, title, content, created_by)
    values (old.id, old.workspace_id, old.project_id, old.title, old.content, coalesce(auth.uid(), old.created_by));
  end if;
  return new;
end;
$$;
create trigger version_note before update on public.notes for each row execute function public.version_note();

create table public.note_tasks (
  note_id uuid not null references public.notes (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, task_id)
);
create index on public.note_tasks (task_id);

create function public.guard_note_task()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_ws uuid;
begin
  select n.workspace_id into v_ws from public.notes n where n.id = new.note_id;
  if v_ws is null or not exists (select 1 from public.tasks t where t.id = new.task_id and t.workspace_id = v_ws) then
    raise exception 'Task and document must be in the same workspace' using errcode = '23514';
  end if;
  new.workspace_id := v_ws;
  return new;
end;
$$;
create trigger guard_note_task before insert on public.note_tasks for each row execute function public.guard_note_task();

-- ---------------------------------------------------------------- goals fed by data
alter table public.key_results
  add column source text not null default 'manual' check (source in ('manual', 'money_income', 'pipeline_won', 'tasks_done')),
  -- tasks_done: {"label_id": "…"}; money_income / pipeline_won: {"project_id": "…"} (optional)
  add column source_config jsonb not null default '{}'::jsonb;
alter table public.key_result_history
  add column note text check (char_length(note) <= 500);

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['deal_stages', 'deals', 'deal_stage_history', 'money_entries', 'note_versions', 'note_tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
-- the history and versions are written by triggers only
revoke insert, update, delete on public.deal_stage_history, public.note_versions from authenticated;

-- pipeline and money: the workspace's full members (guests never see them)
create policy deal_stages_select on public.deal_stages for select to authenticated using (public.is_ws_full_member(workspace_id));
create policy deal_stages_write on public.deal_stages for insert to authenticated with check (public.is_ws_admin(workspace_id));
create policy deal_stages_update on public.deal_stages for update to authenticated using (public.is_ws_admin(workspace_id)) with check (public.is_ws_admin(workspace_id));
create policy deal_stages_delete on public.deal_stages for delete to authenticated using (public.is_ws_admin(workspace_id));

create policy deals_select on public.deals for select to authenticated using (public.is_ws_full_member(workspace_id));
create policy deals_insert on public.deals for insert to authenticated with check (public.is_ws_full_member(workspace_id));
create policy deals_update on public.deals for update to authenticated using (public.is_ws_full_member(workspace_id)) with check (public.is_ws_full_member(workspace_id));
create policy deals_delete on public.deals for delete to authenticated using (created_by = (select auth.uid()) or public.is_ws_admin(workspace_id));

create policy deal_history_select on public.deal_stage_history for select to authenticated using (public.is_ws_full_member(workspace_id));

create policy money_select on public.money_entries for select to authenticated using (public.is_ws_full_member(workspace_id));
create policy money_insert on public.money_entries for insert to authenticated with check (public.is_ws_full_member(workspace_id));
create policy money_update on public.money_entries for update to authenticated using (public.is_ws_full_member(workspace_id)) with check (public.is_ws_full_member(workspace_id));
create policy money_delete on public.money_entries for delete to authenticated using (created_by = (select auth.uid()) or public.is_ws_admin(workspace_id));

-- docs follow their project
create policy note_versions_select on public.note_versions for select to authenticated using (public.can_read_project(project_id));
create policy note_tasks_select on public.note_tasks for select to authenticated
  using (exists (select 1 from public.notes n where n.id = note_id and public.can_read_project(n.project_id)));
create policy note_tasks_insert on public.note_tasks for insert to authenticated
  with check (exists (select 1 from public.notes n where n.id = note_id and public.can_write_project(n.project_id)));
create policy note_tasks_delete on public.note_tasks for delete to authenticated
  using (exists (select 1 from public.notes n where n.id = note_id and public.can_write_project(n.project_id)));
