-- Adds full semester editing for databases where the clean semester rebuild
-- was already applied. This does not modify enrollment rows or user accounts.

alter table public.enrollment_batches
  drop constraint if exists enrollment_batches_window_before_semester;

create or replace function public.update_enrollment_semester(
  p_batch_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_opens_at timestamptz,
  p_closes_at timestamptz
)
returns public.enrollment_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  active_batch_id uuid;
  updated_semester public.enrollment_batches%rowtype;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null or caller_role not in ('teacher', 'teacher_aide') then
    raise exception using errcode = '42501', message = 'Only center staff can update an enrollment semester.';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 20 then
    raise exception using errcode = '23514', message = 'Semester name must contain between 2 and 20 characters.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_opens_at is null or p_closes_at is null then
    raise exception using errcode = '23502', message = 'Semester dates and enrollment dates are required.';
  end if;
  if p_starts_on > p_ends_on then
    raise exception using errcode = '23514', message = 'Semester end must be after semester start.';
  end if;
  if p_opens_at >= p_closes_at then
    raise exception using errcode = '23514', message = 'Enrollment must close after it opens.';
  end if;
  select current_batch_id into active_batch_id
  from public.enrollment_settings
  where id = true
  for update;

  update public.enrollment_batches
  set name = btrim(p_name),
      starts_on = p_starts_on,
      ends_on = p_ends_on,
      opens_at = p_opens_at,
      closes_at = p_closes_at
  where id = p_batch_id
  returning * into updated_semester;

  if not found then
    raise exception using errcode = 'P0002', message = 'Enrollment semester not found.';
  end if;

  if p_batch_id = active_batch_id then
    update public.enrollment_settings
    set opens_at = p_opens_at,
        closes_at = p_closes_at,
        updated_at = now(),
        updated_by = auth.uid()
    where id = true;
  end if;

  return updated_semester;
end;
$$;

revoke all on function public.update_enrollment_semester(uuid, text, date, date, timestamptz, timestamptz) from public, anon;
grant execute on function public.update_enrollment_semester(uuid, text, date, date, timestamptz, timestamptz) to authenticated;
