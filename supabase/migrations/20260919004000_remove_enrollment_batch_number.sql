-- Removes the obsolete numeric batch sequence now that semesters use names.
-- Existing semesters and their linked records are preserved.

alter table public.enrollment_batches
  drop column if exists batch_number;
