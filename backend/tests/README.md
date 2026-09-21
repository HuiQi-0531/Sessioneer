# Backend API and Integration Tests

This folder contains the automated backend tests for Sessioneer.

## What The Tests Cover

- API basics: health check, login success/failure, token protection, role protection, profile loading.
- Admin flows: create user, update user status, send reset link, manage unit tutor access, manage Super Tutor access.
- Unit/tutor integration: add/remove tutors, prevent invalid access, assign sessions, enforce Super Tutor-only lecture/consultation rules.
- Request flows: tutor change request, coordinator review, cover request creation, cover request visibility, cover request claim rules.

## Safety Rule

The tests must run against a separate test database only.

Do not point `TEST_DATABASE_URL` at the production database, Render database, or the normal development database. The test setup drops and recreates the `public` schema before seeding test data.

## Setup

1. Create a separate PostgreSQL database for tests, for example `sessioneer_test_db`.
2. Copy `backend/.env.test.example` to `backend/.env.test`.
3. Update `TEST_DATABASE_URL` in `backend/.env.test` so it points to the test database.

Example:

```env
TEST_DATABASE_URL=postgresql://sessioneer:newSecurePass2026xyz@localhost:5433/sessioneer_test_db
JWT_SECRET=replace_with_a_long_random_test_secret
FRONTEND_URL=http://localhost:3000
BREVO_API_KEY=test_brevo_key_not_used_because_email_is_mocked
```

## Run

From the backend folder:

```bash
npm run test:api
```

## Result For Report

After running the tests, use the Jest summary at the bottom of the terminal output:

```text
Test Suites: 2 passed, 2 total
Tests:       49 passed, 49 total
```

Take a screenshot of that summary or copy the result into the testing section of the report.
