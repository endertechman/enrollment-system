-- Adds a teacher-requested correction and parent resubmission workflow.
-- Apply remotely before deploying the matching frontend changes.

alter table public.enrollments
  add column if not exists review_reason text;

alter table public.enrollments
  drop constraint if exists enrollments_review_reason_length_check;

alter table public.enrollments
  add constraint enrollments_review_reason_length_check
  check (
    review_reason is null
    or char_length(btrim(review_reason)) between 5 and 500
  );

create or replace function public.validate_enrollment_resubmission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text;
begin
  select role
    into actor_role
  from public.profiles
  where id = auth.uid();

  if actor_role = 'parent' and auth.uid() = old.parent_id then
    if old.status <> 'rejected' or new.status <> 'pending' then
      raise exception using
        errcode = '42501',
        message = 'Parents may only resubmit an application that needs changes.';
    end if;

    new.parent_id := old.parent_id;
    new.batch_id := old.batch_id;
    new.reference_code := old.reference_code;
    new.submitted_at := now();
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.review_reason := null;
  elsif actor_role = 'teacher'
    and new.status = 'rejected'
    and old.status is distinct from new.status
    and nullif(btrim(new.review_reason), '') is null then
    raise exception using
      errcode = '23514',
      message = 'A reason is required when requesting application resubmission.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_enrollment_resubmission
  on public.enrollments;

create trigger validate_enrollment_resubmission
before update on public.enrollments
for each row
execute function public.validate_enrollment_resubmission();

create policy "Parents can resubmit own rejected enrollment"
on public.enrollments
as permissive
for update
to authenticated
using (
  auth.uid() = parent_id
  and status = 'rejected'
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'parent'
  )
)
with check (
  auth.uid() = parent_id
  and status = 'pending'
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'parent'
  )
);

comment on column public.enrollments.review_reason is
  'Teacher-provided explanation shown to a parent when an application requires correction and resubmission.';
