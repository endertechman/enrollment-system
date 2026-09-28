-- Allows an enrollment window to remain open after classes have started.
-- This does not change semester dates, enrollment records, RLS, or user accounts.

begin;

alter table public.enrollment_batches
  drop constraint if exists enrollment_batches_window_before_semester;

create or replace function public.create_enrollment_semester(
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
  new_semester public.enrollment_batches%rowtype;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role is null or caller_role not in ('teacher', 'teacher_aide') then
    raise exception using errcode = '42501', message = 'Only center staff can create an enrollment semester.';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 20 then
    raise exception using errcode = '23514', message = 'Semester name must contain between 2 and 20 characters.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_opens_at is null or p_closes_at is null then
    raise exception using errcode = '23502', message = 'Semester dates and enrollment dates are required.';
  end if;
  if p_starts_on < (now() at time zone 'Asia/Manila')::date then
    raise exception using errcode = '23514', message = 'Semester start cannot be in the past.';
  end if;
  if p_starts_on > p_ends_on then
    raise exception using errcode = '23514', message = 'Semester end must be after semester start.';
  end if;
  if p_opens_at < now() then
    raise exception using errcode = '23514', message = 'Enrollment opening cannot be in the past.';
  end if;
  if p_opens_at >= p_closes_at then
    raise exception using errcode = '23514', message = 'Enrollment must close after it opens.';
  end if;

  insert into public.enrollment_batches (
    name, starts_on, ends_on, opens_at, closes_at, archived_at, created_by
  ) values (
    btrim(p_name), p_starts_on, p_ends_on, p_opens_at, p_closes_at, now(), auth.uid()
  ) returning * into new_semester;

  return new_semester;
end;
$$;

revoke all on function public.create_enrollment_semester(text, date, date, timestamptz, timestamptz) from public, anon;
grant execute on function public.create_enrollment_semester(text, date, date, timestamptz, timestamptz) to authenticated;

commit;
