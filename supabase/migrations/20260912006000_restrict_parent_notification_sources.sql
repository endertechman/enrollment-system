-- LOCAL MIGRATION DRAFT. This file has not been applied to the remote project.
--
-- Notifications are derived in the frontend from announcements, calendar events,
-- attendance records, and enrollments. Add RESTRICTIVE audience checks alongside
-- the existing PERMISSIVE read policies so a parent only receives school-wide
-- updates after at least one enrollment has been approved. Existing policies do
-- not need to be removed or renamed. Teachers and teacher aides retain their
-- existing read access, and teacher aides remain view-only.

create policy "Announcement select requires eligible audience"
on public.announcements
as restrictive
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
  or (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'parent'
    )
    and exists (
      select 1
      from public.enrollments
      where enrollments.parent_id = auth.uid()
        and enrollments.status = 'approved'
    )
  )
);

create policy "Calendar select requires eligible audience"
on public.calendar_events
as restrictive
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
  or (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'parent'
    )
    and exists (
      select 1
      from public.enrollments
      where enrollments.parent_id = auth.uid()
        and enrollments.status = 'approved'
    )
  )
);

create policy "Parents can view own approved attendance"
on public.attendance_records
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'parent'
  )
  and exists (
    select 1
    from public.enrollments
    where enrollments.id = attendance_records.enrollment_id
      and enrollments.parent_id = auth.uid()
      and enrollments.status = 'approved'
  )
);

-- Existing INSERT/UPDATE/DELETE policies and grants are intentionally unchanged.
