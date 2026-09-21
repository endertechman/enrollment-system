-- Prevents new attendance and health updates for withdrawn or dropped students.
-- Existing attendance and growth history remains unchanged and readable.

create or replace function public.enforce_active_student_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment_status text;
  learner_status text;
begin
  select status, coalesce(student_state, 'enrolled')
    into enrollment_status, learner_status
  from public.enrollments
  where id = new.enrollment_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Enrollment does not exist.';
  end if;

  if enrollment_status <> 'approved' or learner_status <> 'enrolled' then
    raise exception using
      errcode = '23514',
      message = 'Attendance and health records may only be added for actively enrolled students.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_active_student_attendance
  on public.attendance_records;

create trigger enforce_active_student_attendance
before insert or update on public.attendance_records
for each row
execute function public.enforce_active_student_record();

drop trigger if exists enforce_active_student_growth
  on public.growth_records;

create trigger enforce_active_student_growth
before insert or update on public.growth_records
for each row
execute function public.enforce_active_student_record();

revoke all on function public.enforce_active_student_record() from public, anon, authenticated;

comment on function public.enforce_active_student_record() is
  'Allows attendance and growth writes only for approved enrollments whose student_state is enrolled.';
