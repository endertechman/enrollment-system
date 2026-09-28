-- ECCD developmental assessments (Child's Record 2, ages 3.1 - 5.11).
-- Staff (teacher / teacher aide) record the checklist. Raw scores, scaled scores, total scaled
-- score, standard score and interpretation are computed by the app from the official ECCD
-- lookup tables and stored with the assessment so historical results never change.
-- Parents have NO direct table access: they read results only through
-- get_parent_eccd_results(), which returns scaled scores and the final result, never the
-- checklist responses or raw scores.
-- Review against the remote schema before applying. This file has not been pushed.

create table public.eccd_assessments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  assessor_id uuid references auth.users(id) on delete set null,
  assessor_name text not null,
  assessment_date date not null,
  age_years smallint not null check (age_years between 0 and 7),
  age_months smallint not null check (age_months between 0 and 11),
  age_days smallint not null check (age_days between 0 and 29),
  age_group text not null check (age_group in ('3.1-4.0', '4.1-5.0', '5.1-5.11')),
  responses jsonb not null default '[]'::jsonb,

  gross_motor_raw smallint not null check (gross_motor_raw between 0 and 13),
  fine_motor_raw smallint not null check (fine_motor_raw between 0 and 11),
  self_help_raw smallint not null check (self_help_raw between 0 and 27),
  receptive_language_raw smallint not null check (receptive_language_raw between 0 and 5),
  expressive_language_raw smallint not null check (expressive_language_raw between 0 and 8),
  cognitive_raw smallint not null check (cognitive_raw between 0 and 21),
  socio_emotional_raw smallint not null check (socio_emotional_raw between 0 and 24),

  gross_motor_scaled smallint not null check (gross_motor_scaled between 1 and 19),
  fine_motor_scaled smallint not null check (fine_motor_scaled between 1 and 19),
  self_help_scaled smallint not null check (self_help_scaled between 1 and 19),
  receptive_language_scaled smallint not null check (receptive_language_scaled between 1 and 19),
  expressive_language_scaled smallint not null check (expressive_language_scaled between 1 and 19),
  cognitive_scaled smallint not null check (cognitive_scaled between 1 and 19),
  socio_emotional_scaled smallint not null check (socio_emotional_scaled between 1 and 19),

  total_scaled_score smallint not null check (total_scaled_score between 7 and 133),
  -- Null only when the total falls outside the printed table (29-98); see score_range.
  standard_score smallint check (standard_score between 37 and 138),
  score_range text not null default 'in-table' check (score_range in ('below-table', 'in-table', 'above-table')),
  interpretation text not null,
  table_version text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint eccd_assessments_student_date_key unique (enrollment_id, assessment_date),
  constraint eccd_assessments_standard_range_check check (
    (score_range = 'in-table' and standard_score is not null)
    or (score_range <> 'in-table' and standard_score is null)
  )
);

create index eccd_assessments_enrollment_date_idx
on public.eccd_assessments (enrollment_id, assessment_date desc);

alter table public.eccd_assessments enable row level security;

create policy "Center staff can view ECCD assessments"
on public.eccd_assessments
for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

create policy "Center staff can insert ECCD assessments"
on public.eccd_assessments
for insert
to authenticated
with check (
  assessor_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
  and exists (
    select 1 from public.enrollments
    where enrollments.id = eccd_assessments.enrollment_id
      and enrollments.status = 'approved'
  )
);

create policy "Center staff can update ECCD assessments"
on public.eccd_assessments
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
  assessor_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

create policy "Center staff can delete ECCD assessments"
on public.eccd_assessments
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

revoke all on table public.eccd_assessments from anon, authenticated;
grant select, insert, update, delete on table public.eccd_assessments to authenticated;

create or replace function public.touch_eccd_assessment_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger eccd_assessments_touch_updated_at
before update on public.eccd_assessments
for each row execute function public.touch_eccd_assessment_updated_at();

-- Parent-facing results: final result only. No responses, no raw scores.
create or replace function public.get_parent_eccd_results(p_enrollment_id uuid)
returns table (
  id uuid,
  assessment_date date,
  age_years smallint,
  age_months smallint,
  age_group text,
  gross_motor_scaled smallint,
  fine_motor_scaled smallint,
  self_help_scaled smallint,
  receptive_language_scaled smallint,
  expressive_language_scaled smallint,
  cognitive_scaled smallint,
  socio_emotional_scaled smallint,
  total_scaled_score smallint,
  standard_score smallint,
  score_range text,
  interpretation text,
  assessor_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id, a.assessment_date, a.age_years, a.age_months, a.age_group,
    a.gross_motor_scaled, a.fine_motor_scaled, a.self_help_scaled,
    a.receptive_language_scaled, a.expressive_language_scaled,
    a.cognitive_scaled, a.socio_emotional_scaled,
    a.total_scaled_score, a.standard_score, a.score_range,
    a.interpretation, a.assessor_name
  from public.eccd_assessments a
  join public.enrollments e on e.id = a.enrollment_id
  where a.enrollment_id = p_enrollment_id
    and e.parent_id = auth.uid()
    and e.status = 'approved'
  order by a.assessment_date desc;
$$;

revoke all on function public.get_parent_eccd_results(uuid) from public, anon;
grant execute on function public.get_parent_eccd_results(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'eccd_assessments'
    ) then
    alter publication supabase_realtime add table public.eccd_assessments;
  end if;
end $$;
