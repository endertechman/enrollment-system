-- Allows a signed-in user to change only their own profile name.
-- No direct UPDATE policy or grant is added to public.profiles.
-- Review before applying. This migration has not been pushed remotely.

create or replace function public.update_own_full_name(p_full_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Sign in to update your name.';
  end if;

  cleaned_name := btrim(regexp_replace(coalesce(p_full_name, ''), '[[:space:]]+', ' ', 'g'));
  if char_length(cleaned_name) not between 2 and 100 then
    raise exception using
      errcode = '22023',
      message = 'Name must be between 2 and 100 characters.';
  end if;

  update public.profiles
  set full_name = cleaned_name
  where id = auth.uid()
  returning full_name into cleaned_name;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Account profile does not exist.';
  end if;

  return cleaned_name;
end;
$$;

revoke all on function public.update_own_full_name(text) from public, anon;
grant execute on function public.update_own_full_name(text) to authenticated;
