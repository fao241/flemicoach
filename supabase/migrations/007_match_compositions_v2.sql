create table if not exists public.match_compositions (
  event_id uuid primary key references public.events(id) on delete cascade,
  format smallint not null default 11 check (format in (5,8,11)),
  layout jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
-- Upgrade path from the removed Composition V1: CREATE TABLE IF NOT EXISTS
-- does not add V2 columns to an already existing table.
alter table public.match_compositions
  add column if not exists layout jsonb not null default '[]'::jsonb,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- V1 accepted format 9. V2 supports 5 / 8 / 11 only, without imposing a formation.
update public.match_compositions set format = 11 where format not in (5,8,11);

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

-- Public, read-only composition sharing. The public page only receives rows
-- through this token-scoped RPC; direct anonymous table access remains revoked.
alter table public.match_compositions
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists published boolean not null default false,
  add column if not exists published_at timestamptz;

create unique index if not exists match_compositions_public_token_key
  on public.match_compositions(public_token);

create or replace function public.get_public_match_composition(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'title', e.title,
    'event_date', e.event_date,
    'start_time', e.start_time,
    'location', e.location,
    'format', c.format,
    'layout', c.layout,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name)
      from public.match_callups mc
      join public.players p on p.id = mc.player_id
      where mc.event_id = e.id and p.active = true
    ), '[]'::jsonb)
  )
  from public.match_compositions c
  join public.events e on e.id = c.event_id
  where c.public_token = p_token
    and c.published = true
    and e.cancelled = false
    and e.type = 'match'
  limit 1;
$$;

revoke all on function public.get_public_match_composition(uuid) from public;
grant execute on function public.get_public_match_composition(uuid) to anon, authenticated;
