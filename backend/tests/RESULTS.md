# Backend automated test results

Latest run: 29 September 2026, GitHub Actions on `backend-api-tests`, disposable PostgreSQL 16 database
Workflow: https://github.com/HuiQi-0531/Sessioneer/actions/runs/36510485261

| Suite | Result | Cases |
| --- | --- | ---: |
| API and integration (`npm run test:api`) | Passed in CI | 384 |
| API and integration coverage (`npm run test:api:coverage`) | Passed in CI | 384 |

The API/integration total is 303 route inventory, authentication, and authenticated-handler checks, plus 81 database-backed API/workflow checks. The route inventory covers all 109 HTTP handlers currently declared in `backend/routes`; `/health` is tested separately. The coverage command reruns the same 384 cases, not another 384 unique tests.

The CI coverage run measured:

| Metric | Covered |
| --- | ---: |
| Statements | 65.39% |
| Branches | 52.10% |
| Functions | 72.95% |
| Lines | 67.53% |

Earlier local baseline (28 September 2026): 375 API/integration, 99 RBAC, and 64 logic tests passed on Windows with Node.js 24.15.0 and disposable PostgreSQL 18. That baseline measured 66.54% statements, 53.21% branches, 75.50% functions, and 68.58% lines. Its counts and coverage are historical, before the latest admin session routes were merged. The RBAC and logic suites were not rerun in this CI workflow.

The tests found and the code now rejects six access-control failures: cross-unit tutor unassignment, two cross-unit resume downloads, tutor access to the legacy all-sessions endpoint, tutor self-approval of a request, and direct messages between unrelated users. Request creation now also rejects missing fields with a 400 response and cannot grant its caller tutor access to another unit.

The suite runs against a disposable database and mocks outbound email. It verifies the reminder job's selection and sent-state update, not real email delivery. It does not exercise real Supabase file storage, the external bot model, production configuration, every possible validation branch, or frontend browser behavior. CI is configured in `.github/workflows/backend-api-tests.yml` and passed on the existing `backend-api-tests` branch.

To repeat the run, follow `backend/tests/README.md`. Never point `TEST_DATABASE_URL` at a database containing real data: the test setup drops the `public` schema.
