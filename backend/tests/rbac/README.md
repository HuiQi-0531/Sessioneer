# RBAC (role permission) tests

Automation Test 3. Checks what each role can and cannot do through the backend API:
Unit Coordinator, Tutor, Super Tutor (Lecture / Consultation), Admin, plus
no token / forged token / pending and disabled accounts. 99 cases.

## One-time setup (Mac, Postgres.app)

The tests WIPE the database they run on, so use a separate empty one.
Never point this at Supabase or your normal development database.

```bash
createdb sessioneer_test_db
```

Create `backend/.env.test` (already git-ignored):

```
TEST_DATABASE_URL=postgresql://YOUR_MAC_USERNAME@localhost:5432/sessioneer_test_db
JWT_SECRET=rbac_test_secret_1234567890
```

Then install the test tools once, from `backend`:

```bash
npm install
```

## Run

From `backend`:

```bash
npm run test:rbac
```

Each run also writes `tests/rbac/results/rbac-results.json` with every case,
its HTTP status and the pass rate (used for the report).

A failing case means a permission bug was found, not that the test is broken.
