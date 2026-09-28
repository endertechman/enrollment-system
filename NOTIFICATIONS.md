# Notification behavior

This document describes the notification bell implemented in `src/components/NotificationsMenu.jsx`. It describes the local application code, not a verification of the remote Supabase schema or policies. No remote database changes are made by this feature update.

## Where the bell appears

The bell is in the shared header on every page for signed-in users whose profile role is `parent`, `teacher`, or `teacher_aide`. Guests and accounts without one of those roles do not see it. The badge shows unread notifications, capped visually at `99+`. Opening the bell marks the currently listed unread notifications as read. Clicking a notification also marks it read and opens its destination.

Notification content is built from existing enrollment, announcement, attendance, calendar, and semester records. There is **no separate notification-content table**. Only per-user read receipts are stored in `public.notification_reads` (`user_id`, `notification_id`, `read_at`), so read state can follow the same user across browsers. The local migration for that table is `supabase/migrations/20260921001000_add_notification_reads.sql`. User-supplied remote metadata confirmed that the table exists with RLS enabled; its full policy expressions and migration-history entry were not verified.

## Who receives what

| Update | Who sees it | When it appears | Click destination |
| --- | --- | --- | --- |
| Enrollment submitted or resubmitted | Only the parent who owns that child record | The child has a submission in the active semester. A resubmission uses its new submission time, so it can become unread again. | That child's **Enrollment** tab in the Parent Dashboard. |
| Enrollment accepted or needs changes | Only the parent who owns that child record | The active-semester record currently has `approved` or `rejected` status and a review time. | That child's **Enrollment** tab. A teacher's correction note and the resubmit action, when applicable, are there. |
| Attendance marked present or absent | Only the parent of that actively enrolled child | A recent attendance record exists, excluding dates marked as no-school days. | That child's **Attendance** tab. |
| BCDC announcement | Teachers, teacher aides, and parents with at least one actively enrolled child in the active semester | A published announcement is among the latest 12. | **Announcements** tab for the recipient's role. |
| School calendar event | Teachers, teacher aides, and parents with at least one actively enrolled child in the active semester | The event is dated **today in Philippine time**. | **School Calendar** tab. |
| Enrollment requests needing review | Teachers and teacher aides only | One summary item appears while the active semester has pending requests. It says how many pending requests arrived since this user last opened the bell; after reading, it shows the total still pending. | **Enrollment Requests** tab. Teacher aides can inspect requests but cannot accept them. |
| New active semester / prior semester archived | Parents, teachers, and teacher aides | The active semester and a most recently archived semester are available. This is derived from semester records, not a permanent event log. | Parents: Home schedule card. Staff: **Enrollment Setup** tab. |

Teachers and teacher aides do **not** receive a separate notification for each acceptance, rejection, attendance mark, or other edit they make. Parents without an actively enrolled child do not receive announcement, event, or attendance alerts, but they can still receive updates about their own enrollment application and the semester.

## Refresh, limits, and security

- The bell refreshes from Supabase Realtime changes to its source tables, after the app regains focus, and at Philippine midnight so "today's events" roll over. It does not use a frequent polling timer.
- The menu displays up to 30 of the most recent derived items. It fetches up to 12 announcements and 20 recent attendance records for eligible children. Today's events are sorted toward the top.
- Parent enrollment queries are limited to `parent_id = auth.uid()` in the application. Staff request summaries are limited to the active semester and `pending` status. These client filters are **not** a substitute for remote RLS; confirm the deployed policies separately before relying on them for access control.
- Read receipts are per user. A new staff request makes the shared request summary unread again if its submission time is later than that user's last read time.

## Important limitations

- These are notifications of the **current source records**, not an immutable audit history. If an enrollment is resubmitted, its earlier rejected state is replaced; the old rejection notification is no longer reconstructable from that enrollment row. Likewise, deleted source records disappear from the menu. A permanent event history would require a separately reviewed database design.
- The semester item is inferred from the current active semester and the latest archived semester. It should not be treated as a complete history of every semester switch.
- The menu shows current-semester child notifications. Past-semester child records are not listed in this bell.
