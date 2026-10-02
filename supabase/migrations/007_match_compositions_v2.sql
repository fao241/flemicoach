create table if not exists public.match_compositions (
  event_id uuid primary key references public.events(id) on delete cascade,
  format smallint not null default 11 check (format in (5,8,11)),
  layout jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.match_compositions enable row level security;
revoke all on table public.match_compositions from anon, authenticated;
grant select, insert, update, delete on public.match_compositions to authenticated;
create policy match_compositions_select_member on public.match_compositions for select to authenticated using (
  exists(select 1 from public.events e where e.id=event_id and e.type='match' and public.is_team_member(e.team_id))
);
create policy match_compositions_insert_member on public.match_compositions for insert to authenticated with check (
  exists(select 1 from public.events e where e.id=event_id and e.type='match' and public.is_team_member(e.team_id))
);
create policy match_compositions_update_member on public.match_compositions for update to authenticated using (
  exists(select 1 from public.events e where e.id=event_id and e.type='match' and public.is_team_member(e.team_id))
) with check (
  exists(select 1 from public.events e where e.id=event_id and e.type='match' and public.is_team_member(e.team_id))
);
create policy match_compositions_delete_member on public.match_compositions for delete to authenticated using (
  exists(select 1 from public.events e where e.id=event_id and e.type='match' and public.is_team_member(e.team_id))
);