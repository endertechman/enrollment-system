-- Makes the active semester row the authoritative enrollment-window source.
-- This preserves all users, profiles, enrollments, RLS policies, and semester data.

begin;

-- Keep the public schedule cache aligned for existing frontend readers.
update public.enrollment_settings as settings
set opens_at = batch.opens_at,
    closes_at = batch.closes_at,
    updated_at = now()
from public.enrollment_batches as batch
where settings.id = true
  and batch.id = settings.current_batch_id;

create or replace function public.enforce_enrollment_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_batch_id uuid;
  enrollment_opens_at timestamptz;
  enrollment_closes_at timestamptz;
begin
  select settings.current_batch_id, batch.opens_at, batch.closes_at
  into active_batch_id, enrollment_opens_at, enrollment_closes_at
  from public.enrollment_settings as settings
  join public.enrollment_batches as batch
    on batch.id = settings.current_batch_id
  where settings.id = true;

  if not found
     or enrollment_opens_at is null
     or enrollment_closes_at is null
     or now() < enrollment_opens_at
     or now() > enrollment_closes_at then
    raise exception using
      errcode = '23514',
      message = 'Enrollment is not currently open.';
  end if;

  -- Never trust a client-supplied semester id for a new enrollment.
  new.batch_id := active_batch_id;
  return new;
end;
$$;

commit;
