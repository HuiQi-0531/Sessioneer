# End-to-end acceptance tests (Playwright)

A real Chromium browser drives the real React app and the real backend,
following user stories. Each story starts from a fresh, known database
(`seed.js`), so stories never depend on each other.

## Setup (once)

1. The backend test database must already work: `backend/.env.test` with
   `TEST_DATABASE_URL=...sessioneer_test_db` (see `backend/tests/rbac/README.md`).
   E2E uses the same throwaway database. Never point it at Supabase.
2. Install the root app (`npm install` in the project root) and the backend
   (`npm install` in `backend/`).
3. In this folder:

```bash
npm install
npx playwright install chromium
```

## Run

```bash
cd e2e
npm test              # headless
npm run test:headed   # watch the browser
npm run report        # open the HTML report afterwards
```

Playwright starts the backend on port 5001 and the React dev server on
port 3000 by itself. The same stories also run automatically in CI
(`.github/workflows/ci.yml`) on every pull request. Results are written to `results/e2e-results.json` and
`results/html/`.

## Stories

| ID | User story | File |
|----|------------|------|
| E2E-01 | Tutor confirms one offer and declines another (reason required, reason shown) | tutor-responds-to-offers.spec.js |
| E2E-02 | UC assigns staff in Schedule Builder; a double-booked tutor cannot be picked; tutor accepts | uc-assigns-and-finalises.spec.js |
| E2E-03 | UC can only finalise once all offers are answered; afterwards tutors cannot change | uc-assigns-and-finalises.spec.js |
| E2E-04 | UC broadcasts a cover; another tutor claims it; UC and claimer both see it | cover-request.spec.js |
| E2E-05 | Tutor submits availability; UC grid and Assign Staff use it | availability-and-requests.spec.js |
| E2E-06 | Tutor asks to swap; UC approves; the tutor's schedule moves | availability-and-requests.spec.js |
| E2E-07 | Register: short / mismatched password refused, valid account can log in | accounts-and-access.spec.js |
| E2E-08 | Wrong password shows an error | accounts-and-access.spec.js |
| E2E-09 | Pages are guarded by role in the browser | accounts-and-access.spec.js |
| E2E-10 | Admin disables an account; that user cannot log in | accounts-and-access.spec.js |
| E2E-11 | Schedule Builder List View shows Awaiting / Confirmed and who declined (with reason) | uc-assigns-and-finalises.spec.js |
| E2E-12 | Logging out ends the session on the server: the old token is refused and protected pages go back to login | accounts-and-access.spec.js |
| E2E-13 | A browser whose login was ended elsewhere is sent back to the login page | accounts-and-access.spec.js |

## Adding your own story

Copy a spec file, keep `test.beforeEach(async () => { world = await resetWorld(); })`,
and use `loginAs(page, USERS.tutor.email)` from `helpers.js`. Seeded users
(password `Password123!`): `uc@e2e.test`, `tutor@e2e.test` (offered TUT01 and
TUT02), `cover@e2e.test`, `admin@e2e.test`. Unit `E2E101` has TUT01 (MON 9-10),
TUT02 (TUE 13-14) and TUT03 (WED 15-16, unassigned).
