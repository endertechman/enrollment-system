-- Adds one global enrollment window managed by teachers.
-- Apply only after reviewing this migration against the remote schema.

create table public.enrollment_settings (
  id boolean primary key default true check (id),
  opens_at timestamptz,
  closes_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint enrollment_settings_date_order
    check (opens_at is null or closes_at is null or opens_at <= closes_at)
);

insert into public.enrollment_settings (id) values (true);

alter table public.enrollment_settings enable row level security;

create policy "Anyone can view enrollment schedule"
on public.enrollment_settings
for select
to anon, authenticated
using (true);

create policy "Teachers can update enrollment schedule"
on public.enrollment_settings
for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'teacher'
  )
);

revoke all on table public.enrollment_settings from anon, authenticated;
grant select on table public.enrollment_settings to anon, authenticated;
grant update on table public.enrollment_settings to authenticated;

create or replace function public.enforce_enrollment_window()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  schedule public.enrollment_settings%rowtype;
begin
  select * into schedule
  from public.enrollment_settings
  where id = true;

  if not found
     or schedule.opens_at is null
     or schedule.closes_at is null
     or now() < schedule.opens_at
     or now() > schedule.closes_at then
    raise exception using
      errcode = '23514',
      message = 'Enrollment is not currently open.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_enrollment_window on public.enrollments;

create trigger enforce_enrollment_window
before insert on public.enrollments
for each row
execute function public.enforce_enrollment_window();
