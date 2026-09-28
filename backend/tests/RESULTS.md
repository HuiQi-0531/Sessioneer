# Backend automated test results

Run date: 28 September 2026
Environment: local Windows, Node.js 24.15.0, disposable PostgreSQL 18 database on localhost

| Suite | Result | Cases |
| --- | --- | ---: |
| API and integration (`npm run test:api`) | Passed | 375 |
| Existing role-based access (`npm run test:rbac`) | Passed | 99 |
| Existing logic (`npm run test:logic`) | Passed | 64 |

The API/integration total is 294 route inventory, authentication, and authenticated-handler checks, plus 81 database-backed API/workflow checks. The route inventory covers all 106 HTTP handlers currently declared in `backend/routes`; `/health` is tested separately. These are distinct from the 99 RBAC and 64 logic cases and are not added together to imply additional API integration coverage.

The API coverage run passed all 375 cases and measured:

| Metric | Covered |
| --- | ---: |
| Statements | 66.54% |
| Branches | 53.21% |
| Functions | 75.50% |
| Lines | 68.58% |

The tests found and the code now rejects six access-control failures: cross-unit tutor unassignment, two cross-unit resume downloads, tutor access to the legacy all-sessions endpoint, tutor self-approval of a request, and direct messages between unrelated users. Request creation now also rejects missing fields with a 400 response and cannot grant its caller tutor access to another unit.

The suite runs against a disposable local database and mocks outbound email. It verifies the reminder job's selection and sent-state update, not real email delivery. It does not exercise real Supabase file storage, the external bot model, production configuration, every possible validation branch, or frontend browser behavior. CI has been configured in `.github/workflows/backend-api-tests.yml`, but this local branch has not been pushed or run in GitHub Actions yet.

To repeat the run, follow `backend/tests/README.md`. Never point `TEST_DATABASE_URL` at a database containing real data: the test setup drops the `public` schema.
