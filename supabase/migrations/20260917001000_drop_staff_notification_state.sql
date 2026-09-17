-- Removes the notification-specific checkpoint table.
-- Notifications are derived from their source records. Staff read state is kept
-- per signed-in account in the browser and is not stored as application data.
-- Review before applying to the remote project.

drop table if exists public.staff_notification_state;
