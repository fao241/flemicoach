create table if not exists public.match_compositions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  format smallint not null check (format in (5,8,9,11)),
  formation text not null default 'LIBRE',
  public_token uuid not null unique default gen_random_uuid(),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_composition_players (
  composition_id uuid not null references public.match_compositions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null check (status in ('STARTER','SUBSTITUTE')),
  x numeric(5,2) check (x between 0 and 100),
  y numeric(5,2) check (y between 0 and 100),
  is_captain boolean not null default false,
  is_goalkeeper boolean not null default false,
  primary key (composition_id,player_id)
);

alter table public.match_compositions enable row level security;
alter table public.match_composition_players enable row level security;

create policy "team members manage compositions" on public.match_compositions
for all to authenticated using (
  exists(select 1 from public.events e join public.team_members tm on tm.team_id=e.team_id
    where e.id=event_id and tm.user_id=auth.uid())
) with check (
  exists(select 1 from public.events e join public.team_members tm on tm.team_id=e.team_id
    where e.id=event_id and e.type='match' and tm.user_id=auth.uid())
);

create policy "team members manage composition players" on public.match_composition_players
for all to authenticated using (
  exists(select 1 from public.match_compositions c join public.events e on e.id=c.event_id
    join public.team_members tm on tm.team_id=e.team_id
    where c.id=composition_id and tm.user_id=auth.uid())
) with check (
  exists(select 1 from public.match_compositions c join public.events e on e.id=c.event_id
    join public.team_members tm on tm.team_id=e.team_id
    join public.match_callups mc on mc.event_id=e.id and mc.player_id=player_id
    where c.id=composition_id and tm.user_id=auth.uid())
);

revoke all on public.match_compositions from anon;
revoke all on public.match_composition_players from anon;

create or replace function public.get_public_match_composition(p_token uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'title',e.title,'event_date',e.event_date,'start_time',e.start_time,'location',e.location,
    'format',c.format,'formation',c.formation,
    'players',coalesce((select jsonb_agg(jsonb_build_object(
      'player_id',p.id,'name',p.name,'status',cp.status,'x',cp.x,'y',cp.y,
      'is_captain',cp.is_captain,'is_goalkeeper',cp.is_goalkeeper
    ) order by cp.status,p.name)
    from public.match_composition_players cp join public.players p on p.id=cp.player_id
    where cp.composition_id=c.id),'[]'::jsonb)
  )
  from public.match_compositions c join public.events e on e.id=c.event_id
  where c.public_token=p_token and c.published=true and e.cancelled=false and e.type='match'
  limit 1;
$$;
revoke all on function public.get_public_match_composition(uuid) from public;
grant execute on function public.get_public_match_composition(uuid) to anon, authenticated;
