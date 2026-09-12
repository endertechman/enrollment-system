-- Adds general BCDC announcements.
-- Review against the remote schema before applying. This file has not been pushed.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  author_id uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  constraint announcements_title_length_check
    check (char_length(btrim(title)) between 1 and 100),
  constraint announcements_body_length_check
    check (char_length(btrim(body)) between 1 and 500)
);

create index announcements_published_at_idx
on public.announcements (published_at desc);

alter table public.announcements enable row level security;

create policy "Recognized users can view announcements"
on public.announcements
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

create policy "Teachers can publish announcements"
on public.announcements
for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'
  )
);

create policy "Teachers can delete announcements"
on public.announcements
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

revoke all on table public.announcements from anon, authenticated;
grant select, insert, delete on table public.announcements to authenticated;
