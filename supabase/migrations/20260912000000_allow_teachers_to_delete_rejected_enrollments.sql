-- Allows teachers to delete rejected enrollment records only.
-- This migration does not change parent or teacher-aide access.

create policy "Teachers can delete rejected enrollments"
on public.enrollments
for delete
to authenticated
using (
  status = 'rejected'
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'
  )
);

grant delete on table public.enrollments to authenticated;
