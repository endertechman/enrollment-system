-- Staff-only lookup for the email addresses of parents with enrollment records.
-- This leaves profiles/enrollments RLS unchanged and does not expose Auth users
-- to parents or anonymous visitors.

create or replace function public.get_staff_parent_emails()
returns table (
  parent_id uuid,
  parent_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct
    enrollment.parent_id,
    parent_user.email::text as parent_email
  from public.enrollments as enrollment
  inner join auth.users as parent_user
    on parent_user.id = enrollment.parent_id
  where exists (
    select 1
    from public.profiles as staff_profile
    where staff_profile.id = auth.uid()
      and staff_profile.role in ('teacher', 'teacher_aide')
  );
$$;

revoke all
on function public.get_staff_parent_emails()
from public;

revoke all
on function public.get_staff_parent_emails()
from anon;

grant execute
on function public.get_staff_parent_emails()
to authenticated;
