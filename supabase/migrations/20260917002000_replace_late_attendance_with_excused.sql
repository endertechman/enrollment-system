-- Replaces the attendance status "late" with "excused".
-- Existing RLS policies, grants, ownership, and attendance relationships remain unchanged.
-- Review before applying to the remote project.

alter table public.attendance_records
drop constraint if exists attendance_records_status_check;

update public.attendance_records
set status = 'excused'
where status = 'late';

alter table public.attendance_records
add constraint attendance_records_status_check
check (status in ('present', 'absent', 'excused'));
