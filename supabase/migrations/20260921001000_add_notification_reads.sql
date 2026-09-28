-- Persists each user's notification read state across browsers and devices.
-- Notification content remains derived from its authoritative source tables.

create table if not exists public.notification_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_id text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

alter table public.notification_reads enable row level security;

grant select, insert, update, delete on table public.notification_reads to authenticated;

create policy "Users can view own notification reads"
on public.notification_reads
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own notification reads"
on public.notification_reads
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own notification reads"
on public.notification_reads
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own notification reads"
on public.notification_reads
for delete
to authenticated
using (auth.uid() = user_id);

comment on table public.notification_reads is
  'Per-user read state for notifications derived from enrollment, attendance, announcement, calendar, and semester records.';

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_reads'
  ) then
    alter publication supabase_realtime add table public.notification_reads;
  end if;
end;
$$;
