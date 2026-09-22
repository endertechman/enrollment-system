# Supabase reference material

Files in this folder document or inspect the database. They are **not migrations** and must not be pushed or executed as schema changes. The original `supabase/migrations/` folder remains the location for migration SQL.

## Files

- `remote_schema_baseline_2026-08-26_DO_NOT_APPLY.sql` is the historical, partly reconstructed baseline. Its contents were moved here unchanged because it describes an already deployed database and intentionally raises an error if run. Its `VERIFY/TODO` items remain unresolved.
- `parent_enrollment_hardening_reference_DO_NOT_APPLY.sql` records the later enrollment-write hardening SQL. It is guarded against accidental execution. Do not reapply it: equivalent policy, function, and trigger definitions were observed remotely.
- `remote_security_audit_READ_ONLY.sql` contains metadata queries only. Running these queries does not change the database.

## What was verified remotely

On 2026-09-22, the user supplied results from the remote Supabase project showing:

- RLS enabled on `public.enrollments`, `public.profiles`, and `public.notification_reads`.
- On `public.enrollments`, a permissive parent-owned INSERT policy plus restrictive parent-role and pending-review INSERT policies. The pending-review check requires `status = 'pending'`, `student_state = 'enrolled'`, and null review fields.
- Four enabled enrollment triggers: enrollment window, per-parent limit, server-set submission time, and resubmission validation. The supplied function bodies show the profile row lock, per-semester limit of three, and a child-information-only resubmission check.
- Effective table grants for `anon` and `authenticated`. In particular, `anon` still has broad grants on `enrollments`, `profiles`, and `notification_reads`; these grants do not bypass enabled RLS, but are broader than the guest UI appears to require.

This evidence addresses the specific parent self-approval concern **when requests are subject to RLS**. It does not establish a complete security sign-off. Full remote policy `USING` expressions, all public-table RLS states, function privileges, exact migration history, and direct cross-role tests were not supplied or run. Keep [UAT.md](../../UAT.md) as the release-test record.

No remote SQL was executed or pushed as part of this documentation cleanup. Do not blindly apply the historical baseline or replay local migration files against the existing remote project without reconciliation.
