-- READ-ONLY METADATA AUDIT REFERENCE. These queries read no student, parent,
-- credential, or enrollment rows. They do not apply any migration.
-- The 2026-09-22 results only partially covered this audit; see README.md.

-- RLS activation and force state for the app's public tables.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

-- Every public-table policy, including attendance, growth, notifications,
-- announcements, calendar, semester setup, enrollments, and profiles.
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual as using_expression, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Table privileges that combine with RLS. No user data is selected.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- Whether any browser role can execute sensitive public functions directly.
select p.proname as function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       p.prosecdef as security_definer
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, arguments;

-- Confirm the columns expected by the local security draft.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'enrollments'
order by ordinal_position;

-- Exact enrollment triggers, including trigger order by name.
select t.tgname as trigger_name,
       pg_catalog.pg_get_triggerdef(t.oid) as trigger_definition
from pg_catalog.pg_trigger as t
where t.tgrelid = 'public.enrollments'::regclass
  and not t.tgisinternal
order by t.tgname;

-- Exact deployed enrollment-write function definitions.
select p.proname as function_name,
       pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'validate_enrollment_resubmission',
    'enforce_enrollment_window',
    'enforce_parent_enrollment_limit',
    'set_new_enrollment_submitted_at'
  )
order by p.proname;
