-- Restricts destructive semester deletion to teachers only.
-- Teacher aides may continue viewing, creating, editing, and activating
-- semesters, but cannot permanently delete them.

create or replace function public.delete_enrollment_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  active_batch_id uuid;
begin
  select role
    into caller_role
  from public.profiles
  where id = auth.uid();

  if caller_role is distinct from 'teacher' then
    raise exception using
      errcode = '42501',
      message = 'Only teachers can delete an archived semester.';
  end if;

  select current_batch_id
    into active_batch_id
  from public.enrollment_settings
  where id = true
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Enrollment settings do not exist.';
  end if;

  if p_batch_id is null then
    raise exception using
      errcode = '22004',
      message = 'A semester must be selected.';
  end if;

  if p_batch_id = active_batch_id then
    raise exception using
      errcode = '23514',
      message = 'The active semester cannot be deleted.';
  end if;

  delete from public.enrollment_batches
  where id = p_batch_id
    and archived_at is not null;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Archived semester not found.';
  end if;
end;
$$;

revoke all on function public.delete_enrollment_batch(uuid) from public, anon;
grant execute on function public.delete_enrollment_batch(uuid) to authenticated;
