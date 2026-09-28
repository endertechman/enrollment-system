-- Stores semester dates where attendance is intentionally disabled.
-- Attendance history is preserved; reports ignore records on these dates.

create table if not exists public.attendance_non_school_days (
  batch_id uuid not null references public.enrollment_batches(id) on delete cascade,
  attendance_date date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (batch_id, attendance_date)
);

create or replace function public.validate_attendance_non_school_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  semester_start date;
  semester_end date;
begin
  select starts_on, ends_on
    into semester_start, semester_end
  from public.enrollment_batches
  where id = new.batch_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Semester does not exist.';
  end if;

  if new.attendance_date < semester_start or new.attendance_date > semester_end then
    raise exception using
      errcode = '23514',
      message = 'The no-school date must be within the selected semester.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_attendance_non_school_day
  on public.attendance_non_school_days;

create trigger validate_attendance_non_school_day
before insert or update on public.attendance_non_school_days
for each row
execute function public.validate_attendance_non_school_day();

alter table public.attendance_non_school_days enable row level security;

create policy "Authenticated users can view no-school days"
on public.attendance_non_school_days
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

create policy "Staff can create no-school days"
on public.attendance_non_school_days
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

create policy "Staff can delete no-school days"
on public.attendance_non_school_days
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

revoke all on table public.attendance_non_school_days from anon, authenticated;
grant select, insert, delete on table public.attendance_non_school_days to authenticated;
revoke all on function public.validate_attendance_non_school_day() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'attendance_non_school_days'
    ) then
    alter publication supabase_realtime add table public.attendance_non_school_days;
  end if;
end;
$$;

comment on table public.attendance_non_school_days is
  'Semester dates intentionally excluded from attendance, such as holidays or class cancellations.';
