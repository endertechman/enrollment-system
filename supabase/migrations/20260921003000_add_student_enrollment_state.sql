-- Tracks the lifecycle state of an accepted student separately from the
-- enrollment application's pending/approved/rejected review status.

alter table public.enrollments
  add column if not exists student_state text not null default 'enrolled';

alter table public.enrollments
  drop constraint if exists enrollments_student_state_check;

alter table public.enrollments
  add constraint enrollments_student_state_check
  check (student_state in ('enrolled', 'withdrawn', 'dropped'));

comment on column public.enrollments.student_state is
  'Current lifecycle state for an approved student: enrolled, withdrawn, or dropped.';

-- Existing enrollment RLS remains unchanged. Teachers already have UPDATE
-- access; teacher aides remain read-only and parents retain SELECT-only access.
