-- Adds daily attendance for accepted students.
-- Review against the remote schema before applying. This file has not been pushed.

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  attendance_date date not null,
  status text not null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_student_day_key unique (enrollment_id, attendance_date),
  constraint attendance_records_status_check check (status in ('present', 'absent', 'late'))
);

create index attendance_records_date_idx
on public.attendance_records (attendance_date);

alter table public.attendance_records enable row level security;

create policy "Teachers and teacher aides can view attendance"
on public.attendance_records
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

create policy "Teachers can insert attendance"
on public.attendance_records
for insert
to authenticated
with check (
  recorded_by = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'
  )
  and exists (
    select 1
    from public.enrollments
    where enrollments.id = attendance_records.enrollment_id
      and enrollments.status = 'approved'
  )
);

create policy "Teachers can update attendance"
on public.attendance_records
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'
  )
)
with check (
  recorded_by = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'
  )
  and exists (
    select 1
    from public.enrollments
    where enrollments.id = attendance_records.enrollment_id
      and enrollments.status = 'approved'
  )
);

revoke all on table public.attendance_records from anon, authenticated;
grant select, insert, update on table public.attendance_records to authenticated;
