-- Adds shared BCDC calendar events.
-- Review against the remote schema before applying. This file has not been pushed.

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint calendar_events_title_length_check
    check (char_length(btrim(title)) between 1 and 100),
  constraint calendar_events_description_length_check
    check (description is null or char_length(btrim(description)) between 1 and 500)
);

create index calendar_events_date_idx
on public.calendar_events (event_date);

alter table public.calendar_events enable row level security;

create policy "Recognized users can view calendar events"
on public.calendar_events
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('parent', 'teacher', 'teacher_aide')
  )
);

create policy "Teachers can create calendar events"
on public.calendar_events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'
  )
);

create policy "Teachers can delete calendar events"
on public.calendar_events
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'
  )
);

revoke all on table public.calendar_events from anon, authenticated;
grant select, insert, delete on table public.calendar_events to authenticated;
