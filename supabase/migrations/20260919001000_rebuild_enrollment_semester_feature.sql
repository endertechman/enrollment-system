-- CLEAN REBUILD of the enrollment schedule/semester feature.
-- Run this file only after the old enrollment_settings and enrollment_batches
-- feature has been intentionally discarded. It preserves profiles, Auth users,
-- enrollments, attendance, and growth data.

begin;

drop trigger if exists enforce_enrollment_window on public.enrollments;
drop trigger if exists enforce_parent_enrollment_limit on public.enrollments;

drop function if exists public.enforce_enrollment_window();
drop function if exists public.enforce_parent_enrollment_limit();
drop function if exists public.start_new_enrollment_batch();
drop function if exists public.create_enrollment_semester(text, date, date, timestamptz, timestamptz);
drop function if exists public.set_active_enrollment_semester(uuid);
drop function if exists public.update_active_enrollment_schedule(timestamptz, timestamptz);
drop function if exists public.delete_enrollment_batch(uuid);

drop table if exists public.enrollment_settings cascade;
drop table if exists public.enrollment_batches cascade;

create table public.enrollment_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date,
  ends_on date,
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  constraint enrollment_batches_name_length
    check (char_length(btrim(name)) between 2 and 20),
  constraint enrollment_batches_semester_date_order
    check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint enrollment_batches_window_order
    check (opens_at is null or closes_at is null or opens_at < closes_at)
);

create table public.enrollment_settings (
  id boolean primary key default true check (id),
  current_batch_id uuid not null references public.enrollment_batches(id),
  opens_at timestamptz,
  closes_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint enrollment_settings_date_order
    check (opens_at is null or closes_at is null or opens_at < closes_at)
);

alter table public.enrollments
  add column if not exists batch_id uuid;

alter table public.enrollments
  drop constraint if exists enrollments_batch_id_fkey;

do $$
declare
  initial_batch_id uuid;
begin
  insert into public.enrollment_batches (name)
  values ('Semester 1')
  returning id into initial_batch_id;

  insert into public.enrollment_settings (
    id, current_batch_id, opens_at, closes_at
  )
  values (
    true, initial_batch_id, null, null
  );

  -- Preserve every existing enrollment by moving it into the recovery semester.
  update public.enrollments
  set batch_id = initial_batch_id;
end;
$$;

alter table public.enrollments
  alter column batch_id set not null;

alter table public.enrollments
  add constraint enrollments_batch_id_fkey
  foreign key (batch_id)
  references public.enrollment_batches(id)
  on delete cascade;

drop index if exists public.enrollments_batch_submitted_idx;
create index enrollments_batch_submitted_idx
  on public.enrollments (batch_id, submitted_at desc);

alter table public.enrollment_batches enable row level security;
alter table public.enrollment_settings enable row level security;

create policy "Recognized users can view enrollment batches"
on public.enrollment_batches
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

create policy "Anyone can view enrollment schedule"
on public.enrollment_settings
for select
to anon, authenticated
using (true);

create policy "Teachers can update enrollment schedule"
on public.enrollment_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

revoke all on table public.enrollment_batches from anon, authenticated;
grant select on table public.enrollment_batches to authenticated;
revoke all on table public.enrollment_settings from anon, authenticated;
grant select on table public.enrollment_settings to anon, authenticated;
grant update on table public.enrollment_settings to authenticated;

create or replace function public.enforce_enrollment_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_batch_id uuid;
  enrollment_opens_at timestamptz;
  enrollment_closes_at timestamptz;
begin
  select settings.current_batch_id, batch.opens_at, batch.closes_at
  into active_batch_id, enrollment_opens_at, enrollment_closes_at
  from public.enrollment_settings as settings
  join public.enrollment_batches as batch
    on batch.id = settings.current_batch_id
  where settings.id = true;

  if not found
     or enrollment_opens_at is null
     or enrollment_closes_at is null
     or now() < enrollment_opens_at
     or now() > enrollment_closes_at then
    raise exception using errcode = '23514', message = 'Enrollment is not currently open.';
  end if;

  new.batch_id := active_batch_id;
  return new;
end;
$$;

create or replace function public.enforce_parent_enrollment_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment_count integer;
  active_batch_id uuid;
begin
  perform 1
  from public.profiles
  where id = new.parent_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Parent profile does not exist.';
  end if;

  if tg_op = 'INSERT' or new.batch_id is null then
    select current_batch_id into active_batch_id
    from public.enrollment_settings
    where id = true;
    new.batch_id := active_batch_id;
  end if;

  select count(*) into enrollment_count
  from public.enrollments
  where parent_id = new.parent_id
    and batch_id = new.batch_id
    and (tg_op = 'INSERT' or id <> new.id);

  if enrollment_count >= 3 then
    raise exception using
      errcode = '23514',
      message = 'A parent account can have at most three child enrollments in the current semester.';
  end if;

  return new;
end;
$$;

create trigger enforce_enrollment_window
before insert on public.enrollments
for each row execute function public.enforce_enrollment_window();

create trigger enforce_parent_enrollment_limit
before insert or update of parent_id, batch_id on public.enrollments
for each row execute function public.enforce_parent_enrollment_limit();

create or replace function public.create_enrollment_semester(
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_opens_at timestamptz,
  p_closes_at timestamptz
)
returns public.enrollment_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  new_semester public.enrollment_batches%rowtype;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null or caller_role not in ('teacher', 'teacher_aide') then
    raise exception using errcode = '42501', message = 'Only center staff can create an enrollment semester.';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 20 then
    raise exception using errcode = '23514', message = 'Semester name must contain between 2 and 20 characters.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_opens_at is null or p_closes_at is null then
    raise exception using errcode = '23502', message = 'Semester dates and enrollment dates are required.';
  end if;
  if p_starts_on < (now() at time zone 'Asia/Manila')::date then
    raise exception using errcode = '23514', message = 'Semester start cannot be in the past.';
  end if;
  if p_starts_on > p_ends_on then
    raise exception using errcode = '23514', message = 'Semester end must be after semester start.';
  end if;
  if p_opens_at < now() then
    raise exception using errcode = '23514', message = 'Enrollment opening cannot be in the past.';
  end if;
  if p_opens_at >= p_closes_at then
    raise exception using errcode = '23514', message = 'Enrollment must close after it opens.';
  end if;
  insert into public.enrollment_batches (
    name, starts_on, ends_on, opens_at, closes_at, archived_at, created_by
  ) values (
    btrim(p_name), p_starts_on, p_ends_on, p_opens_at, p_closes_at, now(), auth.uid()
  ) returning * into new_semester;

  return new_semester;
end;
$$;

create or replace function public.set_active_enrollment_semester(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  previous_batch_id uuid;
  selected_semester public.enrollment_batches%rowtype;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null or caller_role not in ('teacher', 'teacher_aide') then
    raise exception using errcode = '42501', message = 'Only center staff can activate an enrollment semester.';
  end if;

  select current_batch_id into previous_batch_id
  from public.enrollment_settings
  where id = true
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'Enrollment settings do not exist.';
  end if;

  select * into selected_semester
  from public.enrollment_batches
  where id = p_batch_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Enrollment semester not found.';
  end if;

  update public.enrollment_batches
  set archived_at = coalesce(archived_at, now())
  where id = previous_batch_id and id <> p_batch_id;

  update public.enrollment_batches
  set archived_at = null
  where id = p_batch_id;

  update public.enrollment_settings
  set current_batch_id = selected_semester.id,
      opens_at = selected_semester.opens_at,
      closes_at = selected_semester.closes_at,
      updated_at = now(),
      updated_by = auth.uid()
  where id = true;
end;
$$;

create or replace function public.update_active_enrollment_schedule(
  p_opens_at timestamptz,
  p_closes_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  active_batch_id uuid;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null or caller_role not in ('teacher', 'teacher_aide') then
    raise exception using errcode = '42501', message = 'Only center staff can update the enrollment schedule.';
  end if;
  if p_opens_at is null or p_closes_at is null or p_opens_at >= p_closes_at then
    raise exception using errcode = '23514', message = 'Choose a valid opening and closing date.';
  end if;

  select current_batch_id into active_batch_id
  from public.enrollment_settings
  where id = true
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'Enrollment settings do not exist.';
  end if;

  update public.enrollment_batches
  set opens_at = p_opens_at, closes_at = p_closes_at
  where id = active_batch_id;

  update public.enrollment_settings
  set opens_at = p_opens_at,
      closes_at = p_closes_at,
      updated_at = now(),
      updated_by = auth.uid()
  where id = true;
end;
$$;

create or replace function public.delete_enrollment_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  active_batch_id uuid;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null or caller_role not in ('teacher', 'teacher_aide') then
    raise exception using errcode = '42501', message = 'Only center staff can delete an archived semester.';
  end if;

  select current_batch_id into active_batch_id
  from public.enrollment_settings
  where id = true
  for update;

  if p_batch_id = active_batch_id then
    raise exception using errcode = '23514', message = 'The active semester cannot be deleted.';
  end if;

  delete from public.enrollment_batches
  where id = p_batch_id and archived_at is not null;
  if not found then
    raise exception using errcode = 'P0002', message = 'Archived semester not found.';
  end if;
end;
$$;

create or replace function public.update_enrollment_semester(
  p_batch_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_opens_at timestamptz,
  p_closes_at timestamptz
)
returns public.enrollment_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  active_batch_id uuid;
  updated_semester public.enrollment_batches%rowtype;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null or caller_role not in ('teacher', 'teacher_aide') then
    raise exception using errcode = '42501', message = 'Only center staff can update an enrollment semester.';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 20 then
    raise exception using errcode = '23514', message = 'Semester name must contain between 2 and 20 characters.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_opens_at is null or p_closes_at is null then
    raise exception using errcode = '23502', message = 'Semester dates and enrollment dates are required.';
  end if;
  if p_starts_on > p_ends_on then
    raise exception using errcode = '23514', message = 'Semester end must be after semester start.';
  end if;
  if p_opens_at >= p_closes_at then
    raise exception using errcode = '23514', message = 'Enrollment must close after it opens.';
  end if;
  select current_batch_id into active_batch_id
  from public.enrollment_settings
  where id = true
  for update;

  update public.enrollment_batches
  set name = btrim(p_name),
      starts_on = p_starts_on,
      ends_on = p_ends_on,
      opens_at = p_opens_at,
      closes_at = p_closes_at
  where id = p_batch_id
  returning * into updated_semester;

  if not found then
    raise exception using errcode = 'P0002', message = 'Enrollment semester not found.';
  end if;

  if p_batch_id = active_batch_id then
    update public.enrollment_settings
    set opens_at = p_opens_at,
        closes_at = p_closes_at,
        updated_at = now(),
        updated_by = auth.uid()
    where id = true;
  end if;

  return updated_semester;
end;
$$;

revoke all on function public.create_enrollment_semester(text, date, date, timestamptz, timestamptz) from public, anon;
revoke all on function public.set_active_enrollment_semester(uuid) from public, anon;
revoke all on function public.update_active_enrollment_schedule(timestamptz, timestamptz) from public, anon;
revoke all on function public.delete_enrollment_batch(uuid) from public, anon;
revoke all on function public.update_enrollment_semester(uuid, text, date, date, timestamptz, timestamptz) from public, anon;
grant execute on function public.create_enrollment_semester(text, date, date, timestamptz, timestamptz) to authenticated;
grant execute on function public.set_active_enrollment_semester(uuid) to authenticated;
grant execute on function public.update_active_enrollment_schedule(timestamptz, timestamptz) to authenticated;
grant execute on function public.delete_enrollment_batch(uuid) to authenticated;
grant execute on function public.update_enrollment_semester(uuid, text, date, date, timestamptz, timestamptz) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.enrollment_settings;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.enrollment_batches;
exception when duplicate_object then null;
end;
$$;

commit;
