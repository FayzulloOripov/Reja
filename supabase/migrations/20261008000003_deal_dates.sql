-- A new deal keeps the dates it was created with (imports and demo data carry their own history);
-- only a stage move stamps stage_changed_at and closed_at.
create or replace function public.guard_deal()
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
  if tg_op = 'INSERT' then
    new.stage_changed_at := coalesce(new.stage_changed_at, now());
    new.closed_at := case when v_kind in ('won', 'lost') then coalesce(new.closed_at, now()) else null end;
  elsif new.stage_id is distinct from old.stage_id then
    new.stage_changed_at := now();
    new.closed_at := case when v_kind in ('won', 'lost') then now() else null end;
  end if;
  return new;
end;
$$;
