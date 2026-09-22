-- Allows a teacher to demote another teacher while preserving self-protection
-- and the existing role-change audit trail.
-- Review before applying. This migration has not been pushed remotely.

create or replace function public.set_account_role(p_user_id uuid, p_role text)
returns table (
  user_id uuid,
  full_name text,
  account_role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role text;
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only teachers can manage account roles.';
  end if;

  if p_user_id = auth.uid() then
    raise exception using
      errcode = '42501',
      message = 'Teachers cannot change their own role.';
  end if;

  select profile.role
  into current_role
  from public.profiles as profile
  where profile.id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Account profile does not exist.';
  end if;

  if not (
    (current_role = 'parent' and p_role in ('teacher_aide', 'teacher'))
    or (current_role = 'teacher_aide' and p_role in ('parent', 'teacher'))
    or (current_role = 'teacher' and p_role in ('parent', 'teacher_aide'))
  ) then
    raise exception using
      errcode = '22023',
      message = 'This role change is not allowed.';
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id;

  insert into public.role_change_audit (
    changed_by,
    target_user_id,
    previous_role,
    new_role
  ) values (
    auth.uid(),
    p_user_id,
    current_role,
    p_role
  );

  return query
  select profile.id, profile.full_name, profile.role
  from public.profiles as profile
  where profile.id = p_user_id;
end;
$$;

revoke all on function public.set_account_role(uuid, text) from public, anon;
grant execute on function public.set_account_role(uuid, text) to authenticated;
