-- Keeps attendance totals consistent at the database level.
-- A date is excluded when its semester has attendance rows but no student is
-- present. It becomes a counted school day as soon as any student is present.
-- Existing all-absent dates are backfilled below.
-- Review before applying. This migration has not been pushed remotely.

create or replace function public.sync_attendance_school_day_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch_id uuid;
begin
  select enrollment.batch_id
  into target_batch_id
  from public.enrollments as enrollment
  where enrollment.id = new.enrollment_id;

  if target_batch_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.attendance_records as attendance
    inner join public.enrollments as enrollment
      on enrollment.id = attendance.enrollment_id
    where enrollment.batch_id = target_batch_id
      and attendance.attendance_date = new.attendance_date
      and attendance.status = 'present'
  ) then
    delete from public.attendance_non_school_days
    where batch_id = target_batch_id
      and attendance_date = new.attendance_date;
  else
    insert into public.attendance_non_school_days (
      batch_id,
      attendance_date,
      created_by
    ) values (
      target_batch_id,
      new.attendance_date,
      new.recorded_by
    )
    on conflict (batch_id, attendance_date) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_attendance_school_day_count
  on public.attendance_records;

create trigger sync_attendance_school_day_count
after insert or update of status, attendance_date, enrollment_id
on public.attendance_records
for each row
execute function public.sync_attendance_school_day_count();

delete from public.attendance_non_school_days as excluded_day
where exists (
  select 1
  from public.attendance_records as attendance
  inner join public.enrollments as enrollment
    on enrollment.id = attendance.enrollment_id
  where enrollment.batch_id = excluded_day.batch_id
    and attendance.attendance_date = excluded_day.attendance_date
    and attendance.status = 'present'
);

insert into public.attendance_non_school_days (
  batch_id,
  attendance_date,
  created_by
)
select
  enrollment.batch_id,
  attendance.attendance_date,
  min(attendance.recorded_by::text)::uuid
from public.attendance_records as attendance
inner join public.enrollments as enrollment
  on enrollment.id = attendance.enrollment_id
where enrollment.batch_id is not null
group by enrollment.batch_id, attendance.attendance_date
having not bool_or(attendance.status = 'present')
on conflict (batch_id, attendance_date) do nothing;

revoke all on function public.sync_attendance_school_day_count()
from public, anon, authenticated;

comment on function public.sync_attendance_school_day_count() is
  'Automatically excludes all-absent attendance dates and counts dates with at least one present student.';
