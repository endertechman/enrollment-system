-- LOCAL DRAFT ONLY. Review and apply to Supabase before deploying the matching UI.
-- Adds school-year/batch separation without changing existing enrollment RLS.

create table public.enrollment_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

alter table public.enrollment_batches enable row level security;

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

revoke all on table public.enrollment_batches from anon, authenticated;
grant select on table public.enrollment_batches to authenticated;

alter table public.enrollment_settings
  add column current_batch_id uuid references public.enrollment_batches(id);

alter table public.enrollments
  add column batch_id uuid references public.enrollment_batches(id) on delete cascade;

with initial_batch as (
  insert into public.enrollment_batches default values
  returning id
)
update public.enrollment_settings
set current_batch_id = initial_batch.id
from initial_batch
where enrollment_settings.id = true;

update public.enrollments
set batch_id = (
  select current_batch_id
  from public.enrollment_settings
  where id = true
)
where batch_id is null;

alter table public.enrollment_settings
  alter column current_batch_id set not null;

alter table public.enrollments
  alter column batch_id set not null;

create index enrollments_batch_submitted_idx
  on public.enrollments (batch_id, submitted_at desc);

create or replace function public.enforce_enrollment_window()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  schedule public.enrollment_settings%rowtype;
begin
  select * into schedule
  from public.enrollment_settings
  where id = true
  for share;

  if not found
     or schedule.current_batch_id is null
     or schedule.opens_at is null
     or schedule.closes_at is null
     or now() < schedule.opens_at
     or now() > schedule.closes_at then
    raise exception using
      errcode = '23514',
      message = 'Enrollment is not currently open.';
  end if;

  -- A client cannot submit a new learner into an archived batch.
  new.batch_id := schedule.current_batch_id;
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
    raise exception using
      errcode = '23503',
      message = 'Parent profile does not exist.';
  end if;

  if tg_op = 'INSERT' or new.batch_id is null then
    select current_batch_id into active_batch_id
    from public.enrollment_settings
    where id = true;

    new.batch_id := active_batch_id;
  end if;

  select count(*)
    into enrollment_count
  from public.enrollments e
  where e.parent_id = new.parent_id
    and e.batch_id = new.batch_id
    and (tg_op = 'INSERT' or e.id <> new.id);

  if enrollment_count >= 3 then
    raise exception using
      errcode = '23514',
      message = 'A parent account can have at most three child enrollments in the current batch.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_parent_enrollment_limit on public.enrollments;

create trigger enforce_parent_enrollment_limit
before insert or update of parent_id, batch_id on public.enrollments
for each row
execute function public.enforce_parent_enrollment_limit();

create or replace function public.start_new_enrollment_batch()
returns public.enrollment_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  previous_batch_id uuid;
  new_batch public.enrollment_batches%rowtype;
begin
  select role into caller_role
  from public.profiles
  where id = auth.uid();

  if caller_role is null or caller_role not in ('teacher', 'teacher_aide') then
    raise exception using errcode = '42501', message = 'Only center staff can start a new enrollment batch.';
  end if;

  select current_batch_id into previous_batch_id
  from public.enrollment_settings
  where id = true
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Enrollment settings do not exist.';
  end if;

  update public.enrollment_batches
  set archived_at = coalesce(archived_at, now())
  where id = previous_batch_id;

  insert into public.enrollment_batches (created_by)
  values (auth.uid())
  returning * into new_batch;

  update public.enrollment_settings
  set current_batch_id = new_batch.id,
      opens_at = null,
      closes_at = null,
      updated_at = now(),
      updated_by = auth.uid()
  where id = true;

  return new_batch;
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
  select role into caller_role
  from public.profiles
  where id = auth.uid();

  if caller_role is null or caller_role not in ('teacher', 'teacher_aide') then
    raise exception using errcode = '42501', message = 'Only center staff can delete an archived enrollment batch.';
  end if;

  select current_batch_id into active_batch_id
  from public.enrollment_settings
  where id = true
  for update;

  if p_batch_id = active_batch_id then
    raise exception using errcode = '23514', message = 'The current enrollment batch cannot be deleted.';
  end if;

  delete from public.enrollment_batches
  where id = p_batch_id
    and archived_at is not null;

  if not found then
    raise exception using errcode = 'P0002', message = 'Archived enrollment batch not found.';
  end if;
end;
$$;

revoke all on function public.start_new_enrollment_batch() from public, anon;
revoke all on function public.delete_enrollment_batch(uuid) from public, anon;
grant execute on function public.start_new_enrollment_batch() to authenticated;
grant execute on function public.delete_enrollment_batch(uuid) to authenticated;

-- Existing enrollments RLS remains unchanged. Attendance and growth records
-- already reference enrollments with ON DELETE CASCADE, so deleting an archived
-- batch removes only that batch's linked enrollment history.
