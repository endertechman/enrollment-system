-- Lets a parent see which dates were real class days for their child's semester
-- (at least one student marked present) without exposing any other student's data.
-- Only dates are returned. Review before applying to the remote project.

create or replace function public.list_class_days(p_batch_id uuid)
returns table (attendance_date date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('teacher', 'teacher_aide')
    )
    or exists (
      select 1
      from public.enrollments
      where enrollments.parent_id = auth.uid()
        and enrollments.batch_id = p_batch_id
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'You cannot view class days for this semester.';
  end if;

  return query
  select distinct attendance.attendance_date
  from public.attendance_records as attendance
  inner join public.enrollments as enrollment
    on enrollment.id = attendance.enrollment_id
  where enrollment.batch_id = p_batch_id
    and attendance.status = 'present'
  order by attendance.attendance_date;
end;
$$;

revoke all on function public.list_class_days(uuid) from public, anon;
grant execute on function public.list_class_days(uuid) to authenticated;

comment on function public.list_class_days(uuid) is
  'Dates in a semester with at least one student present. Callable by that semester''s parents and by staff; returns dates only.';
