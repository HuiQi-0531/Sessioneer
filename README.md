# Sessioneer
Sessioneer: a system for negotiating and scheduling when sessional staff can and will work

Group Members:
- ANG HUI QI (n11574631)
- CHEAH SHUQI (n12282928)
- TAI JIA YUAN (n11896264)
- PHAN CHEN HUAN (n12167282)
- GAN CHUN YANG (n12086215)

# Sessioneer - Session Management System

## Prerequisites
- Node.js (v14+)
- PostgreSQL (v14+), installed and running locally

## Quick Setup

### 1. Clone and Install
```bash
git clone <repo-url>
cd cap-proj

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 2. Create the Database
Open `psql` (or any Postgres client) and create a user and database:
```sql
CREATE USER sessioneer WITH PASSWORD 'your_password_here';
CREATE DATABASE sessioneer_db OWNER sessioneer;
```

Then build the schema (after step 3, once `backend/.env` points at the database):
```bash
cd backend
npm run db:migrate
```
This runs `setup-db.sql` and every numbered file in `backend/db/migrations/` that has not been applied yet. Run it again after every pull that adds a migration (for example `002_reminders_teaching_period_token_version.sql`). It only adds tables and columns; existing data is kept.

### 3. Configure Backend
```bash
cd backend
cp .env.example .env
```
Edit `.env` and point `DATABASE_URL` at your local database, e.g.:
```
DATABASE_URL=postgresql://sessioneer:your_password_here@localhost:5432/sessioneer_db
```
(Default local Postgres port is `5432` — change it if your install uses a different one.)

Also set `JWT_SECRET` to any long random string. The `BREVO_API_KEY`, `SUPABASE_*`, and `CRON_SECRET` variables are optional — they're only needed for password-reset emails, file attachment storage, and scheduled reminder jobs. The app runs fine locally with placeholder values for those.

### 4. Run Application

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```
You should see `Database connected at: <timestamp>`. The backend no longer changes the schema at start-up; if a column is missing, run `npm run db:migrate`.

**Terminal 2 - Frontend:**
```bash
npm start
```
No frontend configuration is needed for local development — the app automatically talks to `http://localhost:5001` whenever it's running on `localhost`/`127.0.0.1`.

### 5. Access Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:5001
- Health Check: http://localhost:5001/health

## Creating an Account
There are no working pre-seeded logins — `setup-db.sql` inserts two sample users (`test1@gmail.com`, `test2@gmail.com`) with a placeholder password hash that can never pass login. Use the **Sign Up** page to create a real Unit Coordinator or Tutor account instead; registered passwords are hashed and verified correctly.

## Troubleshooting

**Port 5432 already in use / can't connect?**
- Check Postgres is actually running: `pg_isready` (or check your OS service manager).
- Confirm the port in `DATABASE_URL` matches what your Postgres instance is listening on.

**Database not connecting?**
- Check the backend console output for `Database connection error:`.
- Double check the username, password, and database name in `DATABASE_URL` match what you created in step 2.

**"Failed to fetch requests"?**
- Make sure the backend is running on port 5001.
- Check `http://localhost:5001/health` returns `"status": "ok"`.

**Login fails for sarah.kim@uni.edu / elaine.lee@student.edu?**
- Expected — see "Creating an Account" above. These accounts have a dummy password hash and cannot log in as shipped.

## Reminder emails and scheduled jobs

All jobs are backend endpoints protected by `CRON_SECRET` (send it as `Authorization: Bearer <secret>` or `x-cron-secret: <secret>`). GitHub Actions calls them on a schedule using the repository secret `SESSIONEER_CRON_SECRET`; each workflow can also be started by hand from the Actions tab (**Run workflow**).

| Endpoint | When | What it does | Workflow |
|----------|------|--------------|----------|
| `POST /jobs/session-assignment-reminders` | Daily 9:00 am Brisbane | Reminds tutors who have not answered an assignment after 3 days | `session-assignment-reminders.yml` |
| `POST /jobs/availability-deadline-reminders` | Daily 9:00 am Brisbane | Emails every tutor / Super Tutor who has not submitted availability when the unit's deadline is 3 days away or less (not locked, not passed). Once per tutor + unit + deadline; a new deadline allows one more | `session-assignment-reminders.yml` (second step) |
| `POST /jobs/session-reminders` | Every hour | Emails tutors whose class starts 23-24 hours from now (Brisbane time). Only when the unit has a teaching period that contains that date, the schedule is locked and the tutor has Confirmed. If the class was taken over through a claimed cover request, only the person covering is reminded. Once per tutor + session + date. Respects the user's "session updates" setting for both the email and the in-app notice | `session-reminders-hourly.yml` |

Every job answers with counts, for example `{ "checkedCount": 5, "emailedCount": 4, "failedCount": 1, "alreadySentCount": 0, "failures": [...] }`. One failed email never stops the others, and a failed one is tried again on the next run.

For testing or a dry run at a chosen moment, a caller with the secret can send `{ "asOf": "2026-10-11T00:15:00Z" }` to run a job as if it were that time.

Other notices:
- **Availability bell (UC Availability page).** Clicking the bell next to a tutor who has not submitted sends the same reminder email and in-app notice straight away. Only a coordinator of that unit can do it, the person must be a tutor on the unit who has not submitted, and only once per tutor per day ("Reminder already sent today").
- **Schedule changes.** When a UC or Admin changes a session's day, time or location, every tutor on it (Pending or Confirmed) gets an in-app notice describing the change, e.g. `TUT02 moved from Mon 10:00–12:00 to Tue 14:00–16:00`. Removing a tutor from a session tells that tutor. Changes that tutors cannot see (capacity, staff note) send nothing. If the class is within 48 hours an email is sent as well. A session cannot be deleted while tutors are still on it, so tutors hear about it at the "removed" step.
- **Teaching period.** Units have an optional teaching start and end date (UC unit form and Admin > Units). Without them no class reminders are sent for that unit.

## Logging out

`POST /auth/logout` ends the login on the server: every token the user holds (on any device) stops working at once and returns `401` with `code: "AUTH_INVALID"`. Changing the password (Profile) or resetting it by email link does the same; the Profile page receives a fresh token so that browser stays logged in. The frontend sends the user back to the login page whenever it receives that 401.

## Tests

| Suite | Command (from `backend/` unless stated) | Tests |
|-------|------------------------------------------|-------|
| Logic (unit) | `npm run test:logic` | 677 |
| API | `npm run test:api` | 427 |
| Integration | `npm run test:integration` | 16 |
| RBAC | `npm run test:rbac` | 99 |
| Frontend components | `CI=true npm test -- --watchAll=false` (project root) | 53 |
| E2E (Playwright) | `npm test` in `e2e/` (see `e2e/README.md`) | 13 |

The API, integration, RBAC and E2E suites need a throwaway PostgreSQL database whose name contains `test` (see `backend/tests/rbac/README.md`).

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request (when it is opened and on every new commit) and on every push to `main`. It starts a temporary PostgreSQL database inside the job and runs, as three checks:

1. **Backend tests (logic, API, integration, RBAC)**
2. **Frontend component tests** (non-interactive, no watch mode)
3. **E2E tests (Playwright)** (the Playwright report is uploaded when it fails)

If any step fails, the check is red. No real secrets or database addresses are in the workflow.

### Branch protection for `main` (one-off, repository admin)

GitHub > repository **Settings** > **Branches** (or **Rules** > **Rulesets**) > add a rule for `main`:

- Require a pull request before merging, with **Required approvals: 1** (another team member must approve).
- Require status checks to pass before merging, and select the three checks above. They only appear in the list after the CI workflow has run once, so open a pull request first.
- Optionally: require branches to be up to date before merging, and do not allow bypassing the rules.

To demonstrate it: open a pull request that breaks one test (the check goes red and **Merge** is blocked), then push a fix (the check goes green and the PR can be merged after one approval).
