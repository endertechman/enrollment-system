# BCDC Enrollment System

A responsive enrollment and student-records app for Binuangan Child Development Center. Parents can submit a separate application for each child and follow its progress; teachers and teacher aides use role-specific dashboards to manage the school year.

## What the app includes

- Parent registration, email confirmation, sign-in, password reset, and account settings
- Multi-child enrollment, duplicate-child warnings, application resubmission, and a three-child limit per semester
- Teacher review of enrollment requests and read-only request review for teacher aides
- Semester and enrollment-window setup, enrolled-student reports, attendance, and health and growth records
- Announcements, school calendar, and role-aware notifications
- Responsive layouts for parent, teacher, and teacher-aide dashboards

The frontend is built with React and Vite and uses Supabase for authentication, data, and realtime updates. Access rules also depend on the deployed Supabase schema, functions, and row-level security policies—not just the interface.

## Run locally

Install dependencies with `npm install`, then run `npm run dev`. The app expects `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the local environment. Do not commit local environment files or secret credentials.

Available checks: `npm run lint`, `npm run build`, and `npm run test:uat-smoke`.

## Project status and documentation

The main features are implemented and production acceptance was **signed off** by the project owner in October 2026. The sign-off record, the local build and smoke check results, and the acceptance cases are in [UAT.md](UAT.md).

- [Notification behavior](NOTIFICATIONS.md): who sees updates and where they lead
- [Supabase reference](supabase/reference/README.md): verified remote facts, remaining unknowns, and documentation-only SQL
- `supabase/migrations/`: migration files; reconcile these with the remote project before applying anything

The files in `supabase/reference/` are not migrations. Do not run or push the historical baseline against the existing remote database.
