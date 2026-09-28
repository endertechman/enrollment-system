-- Records whether an enrollment request has been resubmitted by its parent.
-- Existing rows remain classified as new requests because historical
-- resubmissions cannot be reconstructed reliably from the current schema.

alter table public.enrollments
  add column if not exists resubmitted_at timestamptz;

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

comment on column public.enrollments.resubmitted_at is
  'Timestamp of the latest parent resubmission; null means the request has not been resubmitted.';
