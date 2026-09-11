alter table public.events add column if not exists cancelled boolean not null default false;
alter table public.events add column if not exists cancelled_at timestamptz;

-- Production migration also updates the existing public event, attendance submission,
-- recurring-training generation and reminder functions so cancelled events are ignored.
-- Applied to Supabase production as migration event_cancellation_support.
