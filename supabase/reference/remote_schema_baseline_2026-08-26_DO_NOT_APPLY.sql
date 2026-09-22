-- ============================================================================
-- DOCUMENTATION-ONLY BASELINE: EXISTING REMOTE SUPABASE DATABASE
-- ============================================================================
--
-- This file records database state that was already deployed remotely before
-- local migration tracking was introduced. Table/function details were
-- reconstructed from supplied SQL and context; the RLS policies below were
-- verified directly against remote pg_policies on 2026-08-26.
--
-- DO NOT RUN OR PUSH THIS FILE AS A NORMAL MIGRATION.
-- DO NOT BLINDLY REAPPLY IT TO THE REMOTE PROJECT.
--
-- Before using this as an executable baseline, compare it with a schema dump
-- from the remote Supabase project and resolve every VERIFY/TODO item below.
-- The guard below intentionally stops accidental execution.

do $$
begin
  raise exception
    'DOCUMENTATION-ONLY BASELINE: verify against the remote Supabase schema before use';
end;
$$;

-- ============================================================================
-- KNOWN TABLE SHAPE
-- ============================================================================
--
-- The column types, nullability, defaults, primary keys, foreign keys, and
-- unique constraints written below were explicitly stated in the supplied
-- backend context. Remote constraint names and foreign-key actions were not
-- supplied and therefore cannot be documented exactly.
--
-- VERIFY BEFORE USE:
--   * exact constraint names
--   * foreign-key ON UPDATE / ON DELETE actions
--   * column ownership, comments, privileges, and sequence/identity metadata
--   * whether any additional columns, indexes, or constraints exist remotely

create table public.profiles (
  id uuid primary key references auth.users (id),
  full_name text not null,
  role text not null,
  created_at timestamptz default now()
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id),

  child_first_name text not null,
  child_middle_name text not null,
  child_last_name text not null,
  child_suffix text,

  birth_date date not null,
  sex text not null,
  place_of_birth text not null,
  birth_order integer not null,
  is_registered boolean not null,
  mother_tongue text not null,
  other_dialect text,

  height_cm numeric not null,
  weight_kg numeric not null,

  status text not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  reference_code text not null unique,

  check (status in ('pending', 'approved', 'rejected'))
);

-- VERIFIED REMOTE UNIQUE INDEXES (2026-08-26):
--   * enrollments_pkey on id
--   * enrollments_reference_code_key on reference_code
-- There is no UNIQUE constraint or unique index on parent_id. Do not add one;
-- the application supports up to three enrollment rows per parent account.

-- VERIFY/TODO: reviewed_by was supplied only as a nullable uuid. No foreign-key
-- target or action was provided, so no reviewed_by foreign key is invented here.
--
-- VERIFY/TODO: the supplied context states that sex is restricted to male and
-- female, but did not provide the exact check expression or constraint name.
--
-- VERIFY/TODO: exact SQL was not provided for these stated validation rules:
--   * trimmed child_first_name length 1-50
--   * trimmed child_middle_name length 1-50
--   * trimmed child_last_name length 1-50
--   * nullable child_suffix trimmed length 1-20 when present
--   * trimmed place_of_birth length 1-100
--   * trimmed mother_tongue length 1-50
--   * nullable other_dialect length up to 50 when present
--   * birth_order between 1 and 20
--   * height_cm between 30 and 200
--   * weight_kg between 1 and 150
--   * birth_date cannot be in the future
-- These constraints exist remotely according to the supplied context, but their
-- exact expressions and names must be obtained from Supabase before inclusion.
--
-- VERIFY/TODO: the context states that the system generates reference_code, but
-- no database default, trigger, function, or frontend-only generation SQL was
-- provided. No reference-code generator is invented in this baseline.
--
-- Explicitly absent by design:
--   * age column (calculated in React from birth_date)
--   * parent email column in enrollments (comes from auth.users email)

-- ============================================================================
-- KNOWN FUNCTIONS AND TRIGGER — SQL PROVIDED VERBATIM
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    role
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    ),
    'parent'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.track_enrollment(
  lookup_reference text
)
returns table (
  reference_code text,
  status text,
  submitted_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    e.reference_code,
    e.status,
    e.submitted_at
  from public.enrollments e
  where e.reference_code = lookup_reference
  limit 1;
$$;

-- VERIFY/TODO for functions and trigger:
--   * function owners
--   * EXECUTE grants/revokes for handle_new_user and track_enrollment
--   * whether trigger/function comments or additional settings exist
--   * whether track_enrollment has an explicit volatility or parallel setting
-- No grants are invented below.

-- ============================================================================
-- KNOWN RLS STATE
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.enrollments enable row level security;

-- These policy names, modes, roles, commands, USING expressions, and WITH CHECK
-- expressions were verified directly from remote pg_policies on 2026-08-26.

create policy "Users can view own profile"
on public.profiles
as permissive
for select
to authenticated
using (auth.uid() = id);

create policy "Parents can insert own enrollment"
on public.enrollments
as permissive
for insert
to authenticated
with check (auth.uid() = parent_id);

create policy "Parents can view own enrollments"
on public.enrollments
as permissive
for select
to authenticated
using (auth.uid() = parent_id);

create policy "Teachers can view enrollments"
on public.enrollments
as permissive
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'::text
  )
);

create policy "Teachers can update enrollments"
on public.enrollments
as permissive
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'::text
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'::text
  )
);

create policy "Teacher aides can view enrollments"
on public.enrollments
as permissive
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher_aide'::text
  )
);

-- No teacher_aide UPDATE policy exists by design.
-- No anonymous SELECT policy exists directly on public.enrollments by design.
-- Public tracking is intentionally limited to track_enrollment() output:
-- reference_code, status, and submitted_at only.

-- No other policies on public.profiles or public.enrollments appeared in the
-- supplied pg_policies result. Re-query remote pg_policies before any future
-- deployment if remote policy state may have changed.

-- ============================================================================
-- GRANTS, OWNERSHIP, EXTENSIONS, AND OTHER REMOTE METADATA
-- ============================================================================
--
-- The supplied context did not include exact table grants, sequence grants,
-- schema grants, function EXECUTE grants/revokes, object owners, installed
-- extensions, indexes beyond constraints, or default privileges.
--
-- VERIFY/TODO: obtain these directly from the remote Supabase project before
-- treating this file as a complete or executable schema baseline.
--
-- The later local migration 20260826000000_get_staff_parent_names.sql is NOT
-- part of this baseline because it has not yet been applied remotely.
