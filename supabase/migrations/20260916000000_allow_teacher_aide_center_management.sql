-- Allows teacher aides to manage day-to-day center tools like teachers.
-- Intentionally does NOT grant enrollment UPDATE/DELETE access or role-management access.
-- Review against the remote schema before applying. This file has not been pushed.

drop policy if exists "Teachers can insert attendance" on public.attendance_records;
create policy "Teachers can insert attendance"
on public.attendance_records
for insert
to authenticated
with check (
  recorded_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
  and exists (
    select 1 from public.enrollments
    where enrollments.id = attendance_records.enrollment_id
      and enrollments.status = 'approved'
  )
);

drop policy if exists "Teachers can update attendance" on public.attendance_records;
create policy "Teachers can update attendance"
on public.attendance_records
for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
)
with check (
  recorded_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
  and exists (
    select 1 from public.enrollments
    where enrollments.id = attendance_records.enrollment_id
      and enrollments.status = 'approved'
  )
);

drop policy if exists "Teachers can publish announcements" on public.announcements;
create policy "Teachers can publish announcements"
on public.announcements
for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

drop policy if exists "Teachers can delete announcements" on public.announcements;
create policy "Teachers can delete announcements"
on public.announcements
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

drop policy if exists "Teachers can create calendar events" on public.calendar_events;
create policy "Teachers can create calendar events"
on public.calendar_events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

drop policy if exists "Teachers can delete calendar events" on public.calendar_events;
create policy "Teachers can delete calendar events"
on public.calendar_events
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

drop policy if exists "Teachers can insert growth records" on public.growth_records;
create policy "Teachers can insert growth records"
on public.growth_records
for insert
to authenticated
with check (
  recorded_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
  and exists (
    select 1 from public.enrollments
    where enrollments.id = growth_records.enrollment_id
      and enrollments.status = 'approved'
  )
);

drop policy if exists "Teachers can update growth records" on public.growth_records;
create policy "Teachers can update growth records"
on public.growth_records
for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
)
with check (
  recorded_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
  and exists (
    select 1 from public.enrollments
    where enrollments.id = growth_records.enrollment_id
      and enrollments.status = 'approved'
  )
);

drop policy if exists "Teachers can update enrollment schedule" on public.enrollment_settings;
create policy "Teachers can update enrollment schedule"
on public.enrollment_settings
for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);
