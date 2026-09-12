create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create table if not exists public.fff_clubs (
  cl_no bigint primary key,
  affiliation_number bigint,
  name text not null,
  short_name text,
  location text,
  postal_code text,
  department_code integer,
  district_name text,
  district_short_name text,
  logo text,
  raw jsonb,
  search_text text,
  synced_at timestamptz not null default now()
);

create index if not exists fff_clubs_affiliation_idx on public.fff_clubs(affiliation_number);
create index if not exists fff_clubs_postal_code_idx on public.fff_clubs(postal_code);
create index if not exists fff_clubs_search_text_trgm_idx on public.fff_clubs using gin (search_text extensions.gin_trgm_ops);

alter table public.fff_clubs enable row level security;

create or replace function public.search_fff_clubs_local(q text, result_limit integer default 20)
returns table (
  id bigint,
  name text,
  short_name text,
  city text,
  district text,
  affiliation text,
  postal_code text,
  logo text
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  with needle as (
    select lower(regexp_replace(unaccent(coalesce(q,'')), '[^a-zA-Z0-9]+', ' ', 'g')) as s
  )
  select c.cl_no,
         c.name,
         c.short_name,
         c.location,
         c.district_name,
         c.affiliation_number::text,
         c.postal_code,
         c.logo
  from public.fff_clubs c, needle n
  where length(n.s) >= 2
    and (
      c.search_text like '%' || n.s || '%'
      or similarity(c.search_text, n.s) > 0.18
    )
  order by
    case
      when c.search_text = n.s then 0
      when c.search_text like n.s || '%' then 1
      when c.search_text like '%' || n.s || '%' then 2
      else 3
    end,
    similarity(c.search_text, n.s) desc,
    c.name asc
  limit greatest(1, least(coalesce(result_limit,20), 50));
$$;

revoke all on function public.search_fff_clubs_local(text,integer) from public;
grant execute on function public.search_fff_clubs_local(text,integer) to authenticated;
