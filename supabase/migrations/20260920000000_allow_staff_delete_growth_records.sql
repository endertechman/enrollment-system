-- Allows center staff to remove an incorrect health measurement.
-- This does not allow deleting enrollments, profiles, or Auth users.

drop policy if exists "Center staff can delete growth records" on public.growth_records;

create policy "Center staff can delete growth records"
on public.growth_records
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('teacher', 'teacher_aide')
  )
);

grant delete on table public.growth_records to authenticated;
