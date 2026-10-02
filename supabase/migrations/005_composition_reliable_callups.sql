create or replace function public.get_match_callup_players(p_event_id uuid)
returns table(id uuid, name text)
language sql stable security definer set search_path=public
as $$
  select p.id,p.name
  from public.match_callups mc
  join public.players p on p.id=mc.player_id
  join public.events e on e.id=mc.event_id
  where mc.event_id=p_event_id and p.active=true
    and exists (select 1 from public.team_members tm where tm.team_id=e.team_id and tm.user_id=auth.uid())
  order by p.name;
$$;
revoke all on function public.get_match_callup_players(uuid) from public;
grant execute on function public.get_match_callup_players(uuid) to authenticated;
