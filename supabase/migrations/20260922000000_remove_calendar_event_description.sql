-- Calendar events now use a concise title-only format.
-- This permanently removes any descriptions stored in existing calendar events.

alter table public.calendar_events
drop column if exists description;
