-- FlemiCoach - synchronisation calendrier FFF

alter table public.teams
  add column if not exists fff_club_id bigint,
  add column if not exists fff_club_name text,
  add column if not exists fff_team_key text,
  add column if not exists fff_team_label text,
  add column if not exists fff_competition_id bigint,
  add column if not exists fff_phase integer,
  add column if not exists fff_poule integer,
  add column if not exists fff_last_synced_at timestamptz;

alter table public.events
  add column if not exists source text,
  add column if not exists source_event_id text,
  add column if not exists source_payload jsonb;

create unique index if not exists events_team_source_event_uidx
  on public.events(team_id, source, source_event_id)
  where source is not null and source_event_id is not null;

create index if not exists teams_fff_club_id_idx on public.teams(fff_club_id);

comment on column public.events.source is 'Origine externe éventuelle de l’événement (ex: fff).';
comment on column public.events.source_event_id is 'Identifiant stable de l’événement dans la source externe.';
