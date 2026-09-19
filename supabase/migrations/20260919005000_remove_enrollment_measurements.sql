-- Height and weight are recorded only in public.growth_records by center staff.
-- This removes the obsolete parent-submitted measurements from enrollments.

alter table public.enrollments
  drop column if exists height_cm,
  drop column if exists weight_kg;
