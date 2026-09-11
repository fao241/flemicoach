alter table public.players add column if not exists license_number text;
alter table public.players add column if not exists birth_date date;
create unique index if not exists players_team_license_unique on public.players(team_id, license_number) where license_number is not null and btrim(license_number) <> '';

create table if not exists public.match_callups (
  event_id uuid not null references public.events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, player_id)
);
create index if not exists match_callups_player_idx on public.match_callups(player_id);
alter table public.match_callups enable row level security;
revoke all on table public.match_callups from anon, authenticated;
grant select, insert, delete on public.match_callups to authenticated;

create policy match_callups_select_member on public.match_callups for select to authenticated using (exists(select 1 from public.events e where e.id=event_id and public.is_team_member(e.team_id)));
create policy match_callups_insert_member on public.match_callups for insert to authenticated with check (exists(select 1 from public.events e where e.id=event_id and e.type='match' and public.is_team_member(e.team_id)) and exists(select 1 from public.players p join public.events e on e.id=event_id where p.id=player_id and p.team_id=e.team_id and p.active=true));
create policy match_callups_delete_member on public.match_callups for delete to authenticated using (exists(select 1 from public.events e where e.id=event_id and public.is_team_member(e.team_id)));

create or replace function public.get_public_event(p_token uuid) returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object('event',jsonb_build_object('id',e.id,'team_name',t.name,'type',e.type,'title',e.title,'event_date',e.event_date,'start_time',e.start_time,'location',e.location),'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name) from public.players p where p.team_id=e.team_id and p.active=true and (e.type<>'match' or exists(select 1 from public.match_callups mc where mc.event_id=e.id and mc.player_id=p.id))),'[]'::jsonb)) from public.events e join public.teams t on t.id=e.team_id where e.public_token=p_token and e.event_date>=current_date-1 and e.event_date<=current_date+60;
$$;

create or replace function public.submit_public_attendance(p_token uuid,p_player_id uuid,p_status text,p_note text default '') returns boolean language plpgsql security definer set search_path=public as $$
declare e public.events%rowtype;
begin
 if p_status not in ('PRESENT','ABSENT') then raise exception 'invalid status'; end if;
 if char_length(coalesce(p_note,''))>500 then raise exception 'note too long'; end if;
 select * into e from public.events where public_token=p_token and event_date>=current_date-1 and event_date<=current_date+60;
 if not found then raise exception 'event unavailable'; end if;
 if not exists(select 1 from public.players where id=p_player_id and team_id=e.team_id and active=true) then raise exception 'invalid player'; end if;
 if e.type='match' and not exists(select 1 from public.match_callups where event_id=e.id and player_id=p_player_id) then raise exception 'player not called up'; end if;
 insert into public.attendance(event_id,player_id,declared_status,note,declared_at,updated_at) values(e.id,p_player_id,p_status,coalesce(p_note,''),now(),now()) on conflict(event_id,player_id) do update set declared_status=excluded.declared_status,note=excluded.note,declared_at=now(),updated_at=now();
 return true;
end;$$;
revoke all on function public.get_public_event(uuid) from public;
revoke all on function public.submit_public_attendance(uuid,uuid,text,text) from public;
grant execute on function public.get_public_event(uuid) to anon,authenticated;
grant execute on function public.submit_public_attendance(uuid,uuid,text,text) to anon,authenticated;
