# Enrollment System UAT and integration test record

Date: 22 September 2026 (Asia/Manila)  
Environment checked: local React/Vite project and local production preview  
Release decision: **Signed off** by the project owner in October 2026.

This record distinguishes checks actually executed from acceptance cases that need staging accounts and a verified remote schema. No remote database writes, migration pushes, or destructive tests were performed. `.env.local` was not opened, printed, edited, or copied.

Later user-supplied remote metadata confirmed RLS on three sensitive tables and the enrollment pending-review policy and triggers. This is a partial database check, not a replacement for the role tests below. The scope and remaining unknowns are recorded in [supabase/reference/README.md](supabase/reference/README.md).

## Executed checks

| Check | Result | Evidence and scope |
| --- | --- | --- |
| `npm run lint` | Pass | ESLint exited successfully. Static code check only. |
| `npm run build` | Pass | Vite produced the production bundle without errors. |
| `npm run test:uat-smoke` | Pass, 5/5 | Repeatable server-render checks cover guest landing, parent schedule with and without an enrollment, and teacher/aide landing actions. Uses local fixtures; no Supabase requests or browser clicks. |
| Production-preview route smoke | Pass, 7/7 | `GET /`, `/login`, `/register`, `/enroll`, `/parent`, `/teacher`, and `/teacher-aide` each returned HTTP 200 with the BCDC title. This proves Vite serves the SPA routes, **not** that role protection or page behavior passed. |
| Production asset smoke | Pass, 3/3 | BCDC favicon, built JavaScript, and built CSS returned HTTP 200. |

Run the repeatable local checks with `npm run lint`, `npm run build`, and `npm run test:uat-smoke`. The smoke-test source is `tests/uat-smoke.test.mjs`.

## Sign-off record

| Item | Detail |
| --- | --- |
| Decision | Signed off for release |
| Signed off by | Project owner |
| Date | October 2026 |
| Basis | The owner's acceptance of the system. The per-case results in the table below were **not** updated when sign-off was given and still read "Not run". Update them if a per-case record is needed. |

## Manual acceptance cases

Use a **staging/test Supabase project** or disposable test records, not live family records. Record the date, account role, browser, actual result, and a screenshot or defect ID for each case. Mark a case Pass only after observing the expected result.

| ID | Actor | Test and expected result | Status |
| --- | --- | --- | --- |
| UAT-01 | Guest | Visit Home, Login, and Register on desktop and phone. Home shows guest content; protected URLs do not expose dashboard data. | Not run |
| UAT-02 | Parent | Register and complete email confirmation. Sign in, sign out, reset password, and verify rate-limit/cooldown messages. | Not run |
| UAT-03 | Parent | With enrollment closed, try a new form: no row is inserted. Open a test enrollment window and submit one child; verify the row belongs to that parent and active semester. | Not run |
| UAT-04 | Parent | Enroll a second and third child, then try a fourth. The first three remain separate; the fourth is rejected by the database limit. | Not run |
| UAT-05 | Parent | Open the Parent Dashboard for pending and approved children; switch children. Each tab displays only the selected child's data, and unavailable tabs remain hidden for unapproved children. | Not run |
| UAT-06 | Teacher + parent | Reject a test request with a reason. Parent notification opens that child's Enrollment tab. On the update form, Next does not save; final submission requires confirmation; Cancel does not save; confirming returns the request to pending. | Not run |
| UAT-07 | Teacher | Accept a pending test request; verify status, reviewer, and review time. Parent receives only their own acceptance update. | Not run |
| UAT-08 | Teacher aide | Inspect requests, students, attendance, growth, announcements, and calendar. Aide can use permitted center tools but cannot accept/reject enrollment or manage roles. | Not run |
| UAT-09 | Teacher + aide | Create and activate a test semester, check parent Home dates and staff setup. Edit dates, archive a prior semester, and verify records remain under their own semester. Test deletion only with disposable records. | Not run |
| UAT-10 | Staff + parent | Mark attendance, mark a no-school day, and verify counts and parent attendance view. No-school days must not count as absences or send an attendance alert. | Not run |
| UAT-11 | Staff + parent | Add a health record. Verify BMI/classification, history, and the correct parent's view. Change the selected student and check no record crosses to another child. | Not run |
| UAT-12 | Staff + parent | Publish an announcement and create a same-day event. Eligible parents see them; parents with only pending, rejected, withdrawn, or dropped children do not receive school-update notifications. | Not run |
| UAT-13 | Parent + staff | Open the bell in two browsers on the same account. Read state syncs, a resubmission creates a fresh unread item, and a later pending request refreshes the staff request summary. Click every notification type and verify its destination. | Not run |
| UAT-14 | All roles | Edit own name and password. Teacher changes a test account's role; a newly changed role gets the correct menu and protected routes after refresh. | Not run |
| UAT-15 | All roles | On a narrow phone viewport, check header menus, notification panel, tab navigation, tables, forms, dialogs, and keyboard focus. No horizontal page overflow or hidden action buttons. | Not run |
| UAT-16 | Security tester | With ordinary user tokens in staging, attempt direct Supabase reads/writes outside each role's rights: parent reading another parent's child, aide updating enrollment status, parent changing protected role, and unroled account reading protected data. All must be denied by remote RLS/RPC permissions. | Not run |
| UAT-17 | Teacher + aide + parent | From Enrolled Students, a teacher opens Full Details, edits child information with the pen control, cancels once, then saves with confirmation. The table and report show the saved values. Teacher aide and parent reports remain view-only, and reference code, parent identity, enrollment status, attendance, and growth data cannot be edited through this control. | Not run |
| UAT-18 | Parent + teacher | In one active semester, submit a child, then start a new application using the same normalized full name and birth date. A duplicate warning appears before the normal submission confirmation. Cancel returns to the completed form without saving; Continue Anyway allows the request into the normal teacher review flow. A rejected application resubmission must not trigger this duplicate warning. | Not run |

## Preconditions for sign-off

1. Verify the **actual deployed** Supabase migrations, functions, grants, triggers, and RLS policies against this repository. Local SQL files are not proof that remote changes were applied. Do not blindly reapply the documentation-only baseline.
2. Prepare staging accounts for one parent with multiple child states, a second parent, a teacher, a teacher aide, and an unroled account. Avoid real personal information.
3. Run UAT-01 through UAT-17 on the deployment target, record actual outcomes, and retest any fixes. For security checks, use staging rather than modifying production data.
4. Sign off only when all release-critical cases pass or an explicit risk acceptance is recorded.

Notification visibility and destinations are documented separately in `NOTIFICATIONS.md`. The current notification feed is derived from source records; it is not a permanent audit log.
