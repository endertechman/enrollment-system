-- HISTORICAL SECURITY REFERENCE -- DO NOT APPLY.
-- User-provided remote results on 2026-09-22 show that the restrictive
-- pending-review INSERT policy exists, the two functions below match the
-- deployed definitions, and their enrollment triggers are enabled.
-- RLS was confirmed enabled for enrollments, profiles, and notification_reads.
-- Effective table grants were supplied, but full policy USING expressions,
-- function grants, and direct role-negative tests remain unverified.
-- This is a reference copy, not proof of a complete migration-history match.
-- Prerequisites: batch_id, student_state, review_reason, and resubmitted_at exist.

-- Stop accidental execution before any CREATE or REPLACE statement.
do $$
begin
  raise exception 'Documentation-only security reference: do not execute';
end;
$$;

begin;

-- The documented parent INSERT policy checks ownership only. A restrictive
-- policy prevents a direct API request from inserting an approved/reviewed row.
create policy "Parent enrollment insert requires pending review"
on public.enrollments
as restrictive
for insert
to authenticated
with check (
  parent_id = auth.uid()
  and status = 'pending'
  and student_state = 'enrolled'
  and reviewed_at is null
  and reviewed_by is null
  and review_reason is null
  and resubmitted_at is null
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'parent'
  )
);

-- Preserve teacher review behavior. A parent resubmission may change only the
-- child information exposed by the form and move rejected -> pending. Any
-- present or future staff-owned column is protected by default.
create or replace function public.validate_enrollment_resubmission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role text;
begin
  select role into actor_role
  from public.profiles
  where id = auth.uid();

  if actor_role = 'parent' and auth.uid() = old.parent_id then
    if old.status <> 'rejected' or new.status <> 'pending' then
      raise exception using
        errcode = '42501',
        message = 'Parents may only resubmit an application that needs changes.';
    end if;

    if (to_jsonb(new) - array[
      'child_first_name', 'child_middle_name', 'child_last_name',
      'child_suffix', 'birth_date', 'sex', 'place_of_birth',
      'birth_order', 'is_registered', 'mother_tongue', 'other_dialect',
      'status'
    ]::text[]) is distinct from (to_jsonb(old) - array[
      'child_first_name', 'child_middle_name', 'child_last_name',
      'child_suffix', 'birth_date', 'sex', 'place_of_birth',
      'birth_order', 'is_registered', 'mother_tongue', 'other_dialect',
      'status'
    ]::text[]) then
      raise exception using
        errcode = '42501',
        message = 'This application field cannot be changed by a parent.';
    end if;

    new.submitted_at := now();
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.review_reason := null;
    new.resubmitted_at := now();
  elsif actor_role = 'teacher'
    and new.status = 'rejected'
    and old.status is distinct from new.status
    and nullif(btrim(new.review_reason), '') is null then
    raise exception using
      errcode = '23514',
      message = 'A reason is required when requesting application resubmission.';
  else
    new.resubmitted_at := old.resubmitted_at;
  end if;

  return new;
end;
$$;

-- Do not trust a client-provided submission time for a new request.
create or replace function public.set_new_enrollment_submitted_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.submitted_at := now();
  return new;
end;
$$;

create trigger set_new_enrollment_submitted_at
before insert on public.enrollments
for each row
execute function public.set_new_enrollment_submitted_at();

revoke all on function public.set_new_enrollment_submitted_at()
from public, anon, authenticated;

commit;
