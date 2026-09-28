-- LOCAL DRAFT ONLY. Do not apply until explicitly approved.
-- Reviewed against the authoritative remote pg_policies result from 2026-08-26.
-- The verified PERMISSIVE parent policies enforce ownership but do not verify
-- profiles.role = 'parent', so this hardening remains necessary if enrollment
-- self-access must be restricted to actual parent-role accounts.
--
-- Tighten enrollment self-access so an authenticated user without a recognized
-- profile role cannot inherit parent-like access merely by matching parent_id.
--
-- These policies are RESTRICTIVE. They work alongside the existing PERMISSIVE
-- row policies instead of replacing policies whose exact remote names have not
-- yet been verified.
--
-- Resulting SELECT behavior:
--   parent       -> still limited by the existing auth.uid() = parent_id policy
--   teacher      -> still allowed by the existing teacher SELECT policy
--   teacher_aide -> still allowed by the existing aide SELECT policy
--   unroled      -> denied even if auth.uid() matches parent_id
--
-- Resulting INSERT behavior:
--   parent       -> still limited by the existing auth.uid() = parent_id check
--   all others   -> denied
--
-- This migration intentionally does not change UPDATE policies. Teachers remain
-- the only documented role with enrollment UPDATE access, and teacher aides
-- remain view-only.

create policy "enrollment select requires recognized role"
on public.enrollments
as restrictive
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('parent', 'teacher', 'teacher_aide')
  )
);

create policy "enrollment insert requires parent role"
on public.enrollments
as restrictive
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'parent'
  )
);
