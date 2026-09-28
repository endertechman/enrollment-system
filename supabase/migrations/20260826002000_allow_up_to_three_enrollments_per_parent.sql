-- LOCAL DRAFT ONLY. Do not apply until the remote schema has been verified.
-- Enforces a maximum of three child enrollments per parent account.

create or replace function public.enforce_parent_enrollment_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment_count integer;
begin
  -- Serialize inserts for the same parent so concurrent requests cannot exceed 3.
  perform 1
  from public.profiles
  where id = new.parent_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Parent profile does not exist.';
  end if;

  select count(*)
    into enrollment_count
  from public.enrollments e
  where e.parent_id = new.parent_id
    and (tg_op = 'INSERT' or e.id <> new.id);

  if enrollment_count >= 3 then
    raise exception using
      errcode = '23514',
      message = 'A parent account can have at most three child enrollments.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_parent_enrollment_limit
  on public.enrollments;

create trigger enforce_parent_enrollment_limit
before insert or update of parent_id on public.enrollments
for each row
execute function public.enforce_parent_enrollment_limit();

-- Existing RLS policies are intentionally unchanged.
-- Duplicate-child prevention is intentionally not included pending review.
