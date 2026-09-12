-- Adds dated height and weight records used to calculate BMI.
-- BMI remains calculated data and is intentionally not stored.
-- Review against the remote schema before applying. This file has not been pushed.

create table public.growth_records (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  measured_on date not null,
  height_cm numeric(6,2) not null,
  weight_kg numeric(6,2) not null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_records_student_date_key unique (enrollment_id, measured_on),
  constraint growth_records_height_check check (height_cm between 30 and 200),
  constraint growth_records_weight_check check (weight_kg between 1 and 150)
);

create index growth_records_enrollment_date_idx
on public.growth_records (enrollment_id, measured_on desc);

alter table public.growth_records enable row level security;

create policy "Authorized users can view growth records"
on public.growth_records
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
  or exists (
    select 1
    from public.enrollments
    where enrollments.id = growth_records.enrollment_id
      and enrollments.parent_id = auth.uid()
  )
);

create policy "Teachers can insert growth records"
on public.growth_records
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
    where enrollments.id = growth_records.enrollment_id
      and enrollments.status = 'approved'
  )
);

create policy "Teachers can update growth records"
on public.growth_records
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
    where enrollments.id = growth_records.enrollment_id
      and enrollments.status = 'approved'
  )
);

revoke all on table public.growth_records from anon, authenticated;
grant select, insert, update on table public.growth_records to authenticated;
