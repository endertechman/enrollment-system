-- Staff-only parent-name lookup for the teacher and teacher-aide dashboards.
-- This intentionally leaves the existing profiles and enrollments RLS policies unchanged.

create or replace function public.get_staff_parent_names()
returns table (
  parent_id uuid,
  parent_full_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct
    enrollment.parent_id,
    parent_profile.full_name as parent_full_name
  from public.enrollments as enrollment
  inner join public.profiles as parent_profile
    on parent_profile.id = enrollment.parent_id
  where exists (
    select 1
    from public.profiles as staff_profile
    where staff_profile.id = auth.uid()
      and staff_profile.role in ('teacher', 'teacher_aide')
  );
$$;

revoke all
on function public.get_staff_parent_names()
from public;

revoke all
on function public.get_staff_parent_names()
from anon;

grant execute
on function public.get_staff_parent_names()
to authenticated;
