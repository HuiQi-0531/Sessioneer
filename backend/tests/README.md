# Backend API and integration tests

This suite sends real HTTP requests to the Express app and uses a disposable local PostgreSQL database. It does not call the live Supabase database or send real emails. `tests/jest.setup.js` mocks email delivery.

## Set up a test database

Create an empty PostgreSQL database whose name contains `test`. Use a local host only (`localhost`, `127.0.0.1`, or `::1`). Copy `backend/.env.test.example` to `backend/.env.test` and set `TEST_DATABASE_URL` to the disposable database. Never use a production, Supabase, or Render connection string: the suite drops and recreates the `public` schema before each test file.

For example:

```dotenv
TEST_DATABASE_URL=postgresql://sessioneer_test:password@127.0.0.1:5432/sessioneer_test_db
JWT_SECRET=local-test-secret
FRONTEND_URL=http://localhost:3000
CRON_SECRET=local-test-cron-secret
```

Then run from `backend`:

```bash
npm ci
npm run test:api
npm run test:api:coverage
```

The CI workflow at `.github/workflows/backend-api-tests.yml` starts its own PostgreSQL service and runs the same suite. No `.env.test` file is needed in CI.

## What the results mean

- `route-security-api-integration.test.js` discovers every route declaration in `backend/routes`. The inventory currently has 106 route handlers plus `/health`. It checks missing credentials, invalid credentials, and a valid-role request to every protected route. The public auth/application routes are listed explicitly. Its authenticated smoke checks reject unexpected server errors, but do not by themselves prove that every business operation succeeds.
- `api-integration.test.js` covers login, registration, password reset, account status, admin user/unit/session management, tutor assignment, requests, and cover claims. It checks response data and database side effects.
- `extended-api-integration.test.js` covers availability, tutor applications/invites, messages, notifications, dashboards, unit management, profiles, and tutor markers. It checks persisted state and role boundaries.
- `tests/rbac` and `tests/logic` are teammate-owned suites with separate commands (`npm run test:rbac` and `npm run test:logic`). Their case counts are not included in the API/integration total.

Jest reports the number of passed, failed, and skipped tests. A green total means the tested contracts hold on the disposable database. It is not a claim that every possible input combination or external service is covered. The coverage command writes a detailed source report under `backend/coverage/api`.

## Isolation and safety

Each test file resets the disposable database. Files run sequentially (`--runInBand`) so one file cannot erase another's fixtures. The environment guard forces `DATABASE_URL` to `TEST_DATABASE_URL` before the backend loads, and the API helper additionally requires a local host and a database name containing `test`. Do not remove those guards to make a test run.
